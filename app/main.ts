import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline";
import Stream, { Readable, Writable } from "node:stream";

let isAcceptingInput = true;
const PROMPT_SYMBOL = '$ ';

const BUILTINS = {
  Exit: 'exit',
  Echo: 'echo',
  Type: 'type',
  PWD: 'pwd',
  CD: 'cd',
  HISTORY: 'history',
} as const;

let commandHistory = {
  entries: (() => {
    const filePath = process.env.HISTFILE;

    if (!filePath) {
      return [];
    }

    try {
      return fs.readFileSync(filePath)
        .toString()
        .split('\n')
        .slice(0, -1);
    } catch { }

    return [];
  })(),
  readFromFile(filePath: string) {
    try {
      const fileHistory = fs
        .readFileSync(filePath)
        .toString()
        .split('\n')
        .slice(0, -1);

      this.entries.push(...fileHistory);
    } catch { }
  },
  writeToFile(filePath: string) {
    try {
      fs.writeFileSync(filePath, this.entries.join('\n') + '\n');
    } catch { }
  },
  lastAppendIndex: 0,
  appendToFile(filePath: string) {
    try {
      const fileHistory = fs
        .readFileSync(filePath)
        .toString()
        .split('\n')
        .slice(0, -1);

      fs.writeFileSync(
        filePath,
        [...fileHistory, ...this.entries.slice(this.lastAppendIndex)].join('\n') + '\n'
      );
    } catch { }

    this.lastAppendIndex = commandHistory.entries.length;
  },
  toStringWithLimit(limit: number) {
    return this.entries
      .map((s, i) => `${i + 1}  ${s}`)
      .slice(-limit)
      .join('\n');
  }
};

const pathExes = function getAllExes() {
  const exes: string[] = [];
  const possibleExesPaths = (process.env.PATH || '').split(path.delimiter);

  for (const exeFolder of possibleExesPaths) {
    try {
      for (const exeName of fs.readdirSync(exeFolder)) {
        try {
          fs.accessSync(exeFolder + '/' + exeName, fs.constants.X_OK);
          exes.push(exeName);
        } catch { }
      }
    } catch { }
  }
  return exes;
}();

const uniqExeNames = Array.from(new Set([...pathExes, ...Object.values(BUILTINS)]));

const repl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: PROMPT_SYMBOL,
  completer: (userInput: string) => {
    const normalizedInput = userInput.replaceAll('\x07', '');
    const completions = uniqExeNames
      .filter(str => str.startsWith(normalizedInput))
      .sort();
    const hasSingleCompletion = completions.length === 1;
    const hasNoCompletions = completions.length === 0;

    const partialCompletion = (() => {
      let result = null;

      if (hasNoCompletions || hasSingleCompletion) {
        return result;
      }

      const smallestCompletion = completions[0];

      for (let i = 1; i < completions.length; i++) {
        const completion = completions[i];
        if (smallestCompletion.length > completion.length) {
          return result;
        }
      }

      for (let i = normalizedInput.length; i < smallestCompletion.length; i++) {
        const smallestCompletionChar = smallestCompletion[i];

        for (let k = 1; k < completions.length; k++) {
          const completion = completions[k];
          const completionChar = completion[i];

          if (smallestCompletionChar !== completionChar) {
            return result;
          }

          if (k === completions.length - 1) {
            result ??= '';
            result += completionChar;
          }
        }
      }

      return result;
    })();

    if (hasNoCompletions) {
      return [[normalizedInput + '\x07'], normalizedInput];
    }

    if (hasSingleCompletion) {
      return [[completions[0] + ' '], userInput];
    }

    if (partialCompletion) {
      return [[normalizedInput + partialCompletion], normalizedInput];
    }

    if (!userInput.endsWith('\x07')) {
      return [[normalizedInput + '\x07'], normalizedInput];
    }

    isAcceptingInput = false;
    repl.write('', { name: 'enter' });
    writeOutput(completions.join('  '));
    isAcceptingInput = true;
    repl.prompt();
    repl.write(normalizedInput);

    return ''; // prevent error
  },
});

function getExe(fileName: string) {
  const envPath = process.env.PATH || '';
  const pathArr = envPath.split(path.delimiter);

  for (const tmpPath of pathArr) {
    try {
      const filePath = path.join(tmpPath, fileName);

      fs.accessSync(filePath, fs.constants.X_OK);

      return {
        fileName,
        filePath,
      };

    } catch { }
  }

  return null;
}

function getExeOutput(exeName: string, args: string[]) {
  const buffer = spawnSync(exeName, args);

  const stdout = buffer.stdout.toString();
  const stderr = buffer.stderr.toString();

  return {
    output: stdout,
    error: stderr,
  };
}

function writeOutput(input: string) {
  const output = input.endsWith('\n')
    ? input
    : `${input}\n`;

  process.stdout.write(output);
}

const isWord = (srt: string) => !!srt.trim();

const isQuoted = (s: string, q: `'` | `"`) => {
  return s.length >= 2 && s.startsWith(q) && s.endsWith(q);
};

function tokenize(str: string) {
  const regexp = RegExp(
    /((?<=\\).{1})|('.+?')|("(?:\\\"|.)+?")|(\s+)|([^\s'"\\]+)/g
  );
  const tokens = str.match(regexp) || [];

  //remove encapsing quotes, normalize non word stings to single spaces
  return tokens.map((string) => {

    if (string.length > 2 && isQuoted(string, `'`)) {
      return string.slice(1, -1);
    }

    if (string.length > 2 && isQuoted(string, `"`)) {
      return string.slice(1, -1).replaceAll(/(?<!\\)\\(?=\\|")/g, '');
    }

    return string.replaceAll(/\s+/g, ' ');
  }).filter(Boolean);
}

const REDIRECT_SIGN = {
  '>': '>',
  '1>': '1>',
  '2>': '2>',
  '>>': '>>',
  '1>>': '1>>',
  '2>>': '2>>',
} as const;


function parseRedirect(
  words: string[]
): null | {
  redirectIndex: number,
  redirectSign: typeof REDIRECT_SIGN[keyof typeof REDIRECT_SIGN],
  fileArgs?: string,
} {
  let redirectIndex = null;
  let redirectSign: null | typeof REDIRECT_SIGN[keyof typeof REDIRECT_SIGN] = null;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (!(Object.values(REDIRECT_SIGN).some(s => s === word))) {
      continue;
    }

    // @ts-expect-error
    redirectSign = word;
    redirectIndex = i;
  }

  return (redirectIndex !== null) && redirectSign
    ? { redirectIndex, redirectSign }
    : null;
}

function generateBuiltin(command: string, args: string[]): {
  output?: string,
  error?: string,
} | null {
  switch (command) {
    case (BUILTINS.Exit): {
      const filePath = process.env.HISTFILE;

      if (filePath) {
        commandHistory.writeToFile(filePath);
      }

      throw "EXIT";
    }

    case (BUILTINS.Echo): {
      return { output: `${args.join('')}\n` };
    }

    case (BUILTINS.Type): {
      const secondCommand = args.filter(isWord)[0];

      if (!secondCommand) {
        return {};
      }

      const rawCommandsPool = Object.values(BUILTINS);

      if (rawCommandsPool.some(str => str === secondCommand)) {
        return { output: `${secondCommand} is a shell builtin` };
      }

      const exe = getExe(secondCommand);

      if (exe) {
        return { output: `${exe.fileName} is ${exe.filePath}` };
      }

      return { error: `${secondCommand} not found` };
    }

    case (BUILTINS.PWD): {
      return { output: process.cwd() + '\n' };
    }

    case (BUILTINS.CD): {
      const tmpPath = args.filter(isWord)[0];

      try {
        const homePath = process.env['HOME'];
        const tmpLeftover = typeof homePath === 'string' && tmpPath.startsWith('~')
          ? tmpPath.replace('~', homePath)
          : tmpPath;
        process.chdir(tmpLeftover);
      } catch {
        return { error: `cd: ${tmpPath}: No such file or directory` };
      }
      return {};
    }

    case (BUILTINS.HISTORY): {
      const argWords = args.filter(isWord);
      const flag = argWords[0];
      const filePath = argWords[1];

      switch (flag) {
        case ('-r'): {
          commandHistory.readFromFile(filePath);
          return {};
        }
        case ('-w'): {
          commandHistory.writeToFile(filePath);
          return {};
        }
        case ('-a'): {
          commandHistory.appendToFile(filePath);
          return {};
        }
      }
      return {
        output: commandHistory.toStringWithLimit(
          Number.isInteger(+flag) ? +flag : 0
        ),
      };
    }

    default: {
      return null;
    }
  }
}

function redirectOutput(
  { redirectSign, fileArgs }: {
    redirectIndex: number;
    redirectSign: keyof typeof REDIRECT_SIGN;
    fileArgs?: string | undefined;
  },
  buffer: {
    output?: string | undefined;
    error?: string | undefined;
  }
) {
  if (!fileArgs) {
    return buffer;
  }

  switch (redirectSign) {
    case '>':
    case '1>': {
      fs.writeFileSync(fileArgs, buffer.output || '');
      delete buffer.output;
      break;
    }

    case '2>': {
      fs.writeFileSync(fileArgs, buffer.error || '');
      delete buffer.error;
      break;
    }

    case ">>":
    case '1>>':
    case '2>>': {
      let fileContent;
      try {
        fileContent = fs.readFileSync(fileArgs).toString();
      } catch { }

      if (fileContent && !fileContent.endsWith('\n')) {
        fileContent += '\n';
      }

      fs.writeFileSync(
        fileArgs,
        (fileContent ?? '') + (
          buffer[redirectSign !== '2>>' ? 'output' : 'error'] ?? ''
        )
      );
      delete buffer[redirectSign !== '2>>' ? 'output' : 'error'];

      break;
    }
  }

  return buffer;
};

async function processCommand(input: string) {
  let rawTokens = tokenize(input);
  const redirect = parseRedirect(rawTokens);

  const pipelineCommands = (() => {
    const words = rawTokens.filter(isWord);
    const commands = [];

    for (let i = 0, k = 0; i < words.length; i++) {
      const word = words[i];

      if (word === '|') {
        const command = words.slice(k, i);
        commands.push({
          name: command[0],
          args: command.slice(1),
        });
        k = i + 1;
      }

      if (i === words.length - 1 && commands.length) {
        const command = words.slice(k);
        commands.push({
          name: command[0],
          args: command.slice(1),
        });
      }
    }

    if (commands.length < 2) {
      return null;
    }

    return commands;
  })();

  if (pipelineCommands) {
    isAcceptingInput = false;

    function buildCommandStreams({ name, args }: { name: string, args: string[] }) {
      const { stdout, stdin } = (() => {
        const builtin = generateBuiltin(name, args);

        if (builtin) {
          const chunks: Buffer[] = [];

          const stdout = new Readable({
            read: function () {
              this.push((builtin.output ?? ''));
              this.push(null);
            }
          });

          const stdin = new Writable({
            write(chunk, _enc, cb) {
              chunks.push(Buffer.from(chunk));
              cb();
            },

            final(callback) {
              const stdinStr = Buffer.concat(chunks).toString("utf8");
              const result = generateBuiltin(name, tokenize(stdinStr));

              if (result) {
                stdout.push(result.output);
              }

              callback();
            },
          });

          return { stdout, stdin };
        }

        return spawn(name, args);
      })();

      return { stdout, stdin };
    }

    await (async function pipeCommands(commands: { name: string, args: string[] }[]) {
      let commandA = commands[0];
      let bufferA = buildCommandStreams(commandA);

      for (let i = 1; i < commands.length; i++) {
        let commandB = commands[i];
        let bufferB = buildCommandStreams(commandB);

        bufferA.stdout.pipe(bufferB.stdin);

        if (i === commands.length - 1) {
          await new Promise((resolve) => {
            bufferB.stdout?.on('data', (data) => {
              writeOutput(data.toString());
            });

            bufferB.stdout?.on('close', () => resolve(null));
          });
          break;
        }

        [commandA, bufferA] = [commandB, bufferB];
      }
    })(pipelineCommands);

    isAcceptingInput = true;
    return;
  }

  if (redirect) {
    redirect.fileArgs = rawTokens
      .splice(redirect.redirectIndex)
      .filter(isWord)[1];
  }

  const firstWordIndex = rawTokens.findIndex(isWord);

  if (firstWordIndex < 0) {
    return;
  }

  const secondWordIndex = firstWordIndex + 2;

  const command = {
    main: rawTokens[firstWordIndex],
    args: rawTokens.slice(secondWordIndex),
  };

  let output = generateBuiltin(command.main, command.args);

  output ??= (() => {
    const exe = getExe(command.main);

    if (!exe) {
      return { error: `${input}: command not found` };
    }

    return getExeOutput(exe.fileName, command.args.filter(isWord));
  })();

  if (redirect) {
    output = redirectOutput(redirect, output);
  }

  if (!output.error && !output.output) {
    return;
  }

  writeOutput((output.error ?? '') + (output.output ?? ''));
}

repl.prompt();
repl.on('history', (history) => {
  const lastRecord = history[0];

  if (lastRecord) {
    commandHistory.entries.push(lastRecord);
  }
});

repl.on('line', async function (input) {
  if (!isAcceptingInput) {
    return;
  }

  try {
    await processCommand(input);
  } catch {
    process.exit();
  }

  repl.prompt();
});