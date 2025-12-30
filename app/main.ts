import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { arrayBuffer } from "node:stream/consumers";

let processInput = true;
const PROMPT_SIGN = '$ ';

const COMMAND_BUILTIN = {
  Exit: 'exit',
  Echo: 'echo',
  Type: 'type',
  PWD: 'pwd',
  CD:'cd',
} as const;

function getAllExes() {
  const exes: string[] = [];
  const possibleExesPaths = (process.env.PATH ||'').split(path.delimiter);

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
}

const exeNames = getAllExes();
const uniqExeNames = Array.from(new Set([...exeNames, ...Object.values(COMMAND_BUILTIN)]));

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: PROMPT_SIGN,
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

    processInput = false;
    rl.setPrompt('');
    rl.write('', {name: 'enter'});
    rl.write(completions.join('  '));
    rl.setPrompt(PROMPT_SIGN);
    rl.write('', {name: 'enter'});
    rl.write(normalizedInput);
    processInput = true;

    return ''; // prevent error
  }
});

function getExe(xFileName: string){
  const envPath = process.env.PATH ||'';
  const pathArr = envPath.split(path.delimiter);

  for (const tmpPath of pathArr) {
    try {
      const filePath = path.join(tmpPath, xFileName);

      fs.accessSync(filePath, fs.constants.X_OK);

      return {
        fileName: xFileName,
        filePath,
      };

    } catch {}
  }

  return null;
}

function runExe(exeName: string, args: string[]) {
  const buffer = args.length
    ? spawnSync(exeName, args)
    : spawnSync(exeName);

  return {
    output: buffer.stdout.toString(),
    error: buffer.stderr.toString()
  };
}

function giveOutput(input:string) {
  const output = input.endsWith('\n')
    ? input
    : `${input}\n`;

    processInput = false;
    rl.setPrompt('');
    rl.write('', {name: 'enter'});
    rl.write(output);
    rl.setPrompt(PROMPT_SIGN);
    processInput = true;
}

const isWord = (srt: string) => !!srt.trim();

const isEncapsed = (s: string, q: `'` | `"`) => {
  return s.length >= 2 && s.startsWith(q) && s.endsWith(q);
};

function processString(str: string) {
  const regexp = RegExp(
    /((?<=\\).{1})|('.+?')|("(?:\\\"|.)+?")|(\s+)|([^\s'"\\]+)/g
  );
  const  tmpWords = str.match(regexp)|| [];

  //remove encapsing quotes, normalize non word stings to single spaces
  return tmpWords.map((string) => {

    if (string.length > 2 && isEncapsed(string, `'`)) {
      return string.slice(1, -1);
    }

    if (string.length > 2 && isEncapsed(string, `"`)) {
      return string.slice(1, -1).replaceAll(/(?<!\\)\\(?=\\|")/g, '');
    }

    return string.replaceAll(/\s+/g,' ');
  }).filter(Boolean);
}

const REDIRECT_SIGN =  {
  '>': '>',
  '1>': '1>',
  '2>': '2>',
  '>>': '>>',
  '1>>': '1>>',
  '2>>': '2>>',
} as const;


function detectRedirect(
  words: string[]
): null|{
  redirectIndex: number,
  redirectSign: typeof REDIRECT_SIGN[keyof typeof REDIRECT_SIGN],
  fileArgs?: string,
} {
  let redirectIndex = null;
  let redirectSign: null | typeof REDIRECT_SIGN[keyof typeof REDIRECT_SIGN]= null;

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
    ? {redirectIndex, redirectSign}
    : null;
}

function generateOutput(command: {
    main: string;
    leftover: string[];
    leftoverWords: string[];
    raw: string,
}): {
  output?: string,
  error?: string,
} {
    switch (command.main) {
    case (COMMAND_BUILTIN.Exit): {
      rl.close();
      return {};
    }

    case (COMMAND_BUILTIN.Echo): {
      return {output: `${command.leftover.join('')}`};
    }

    case (COMMAND_BUILTIN.Type): {
        const secondCommand = command.leftoverWords[0];

        if (!secondCommand) {
          return {};
        }

        const rawCommandsPool = Object.values(COMMAND_BUILTIN);

        if (rawCommandsPool.some(str => str === secondCommand)) {
          return {output: `${secondCommand} is a shell builtin`};
        }

        const exe = getExe(secondCommand);

        if (exe) {
          return {output: `${exe.fileName} is ${exe.filePath}`};
        }

        return {error: `${secondCommand} not found`};
    }

    case (COMMAND_BUILTIN.PWD): {
      return {output: process.cwd()};
    }

    case (COMMAND_BUILTIN.CD): {
      const tmpPath = command.leftoverWords[0];

      try {
        const homePath = process.env['HOME'];
        const tmpLeftover = typeof homePath === 'string' && tmpPath.startsWith('~')
          ? tmpPath.replace('~', homePath)
          : tmpPath;
        process.chdir(tmpLeftover);
      } catch {
        return {error: `cd: ${tmpPath}: No such file or directory`};
      }
      return {};
    }


    default: {
      const args = command.leftoverWords;
      const exe = getExe(command.main);

      if (!exe) {
          // change condition
        return {error: `${command.raw}: command not found`};
      }

      return runExe(exe.fileName, args);
    }
  }
}

function redirectOutput(
  {redirectSign, fileArgs}: {
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

  switch(redirectSign) {
    case '>':
    case '1>': {
        fs.writeFileSync(fileArgs, buffer.output || '');
        delete buffer.output;
      break;
    }

    case '2>':{
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
      } catch {}

      if(fileContent && !fileContent.endsWith('\n')) {
        fileContent += '\n';
      }

      fs.writeFileSync(
        fileArgs,
        (fileContent??'') + (
          buffer[redirectSign !== '2>>' ? 'output' : 'error']??''
        )
      );
      delete buffer[redirectSign !== '2>>' ? 'output' : 'error'];

      break;
    }
  }

  return buffer;
};

//Main flow
async function processCommand(input: string) {
  let rawInputWords = processString(input);
  const redirect = detectRedirect(rawInputWords);

  const pipeline = (() => {
    const words = rawInputWords.filter(isWord);
    const pipeIndex = words.indexOf('|');

    if (pipeIndex === -1) {
      return null;
    }

    const leftPart = words.slice(0, pipeIndex);
    const rightPart = words.slice(pipeIndex + 1);

    const commandA = {
      exeName: leftPart[0],
      args: leftPart.slice(1),
    };

    const commandB = {
      exeName: rightPart[0],
      args: rightPart.slice(1),
    };

    return [commandA, commandB];
  })();

  if (pipeline) {
    await (async function pipeCommands(
      commandA: {
      exeName: string,
      args: string[]
    }, commandB: {
      exeName: string,
      args: string[]
    }
    ) {
      const bufferA = spawn(commandA.exeName, commandA.args);
      const bufferB = spawn(commandB.exeName, commandB.args);
      bufferA.stdout.pipe(bufferB.stdin);

      await new Promise((resolve) => {
        bufferB.stdout?.on('data', (data) => {
          giveOutput(data.toString());
          resolve(null);
        });
    });
    })(pipeline[0], pipeline[1]);

    return;
  }

  if (redirect) {
    redirect.fileArgs  = rawInputWords
      .splice(redirect.redirectIndex)
      .filter(isWord)[1];
  }

  const mainCommandIndex = rawInputWords.findIndex(isWord);

  if (mainCommandIndex < 0) {
    return;
  }

  const command = {
    main: rawInputWords[mainCommandIndex],
    leftover: rawInputWords.slice(mainCommandIndex + 2),
    leftoverWords: rawInputWords.slice(mainCommandIndex + 2).filter(isWord),
    raw: input,
  };

  let outputBuffer = generateOutput(command);

  if (command.main === COMMAND_BUILTIN.Exit) {
    throw "EXIT";
  }

  if (redirect) {
    outputBuffer = redirectOutput(redirect, outputBuffer);
  }

  if (!outputBuffer.error && !outputBuffer.output) {
    return;
  }

  giveOutput((outputBuffer.error??'') + (outputBuffer.output??''));
}

  rl.prompt();
  rl.on('line', async function (input) {
    try{
      if (processInput) {
        await processCommand(input);
      }
    } catch {
      process.exit();
    }

    rl.prompt();
  });
