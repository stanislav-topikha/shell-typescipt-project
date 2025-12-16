import { execFileSync, spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline";


const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const COMMAND_ACTION = {
  Exit: 'exit',
  Echo: 'echo',
  Type: 'type',
  PWD: 'pwd',
  CD:'cd',
} as const;

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

  process.stdout.write(output);
}

const isWord = (srt: string) => !!srt.trim();

const isEncapsed = (str: string, encapser: `'` | `"`) => {
    return str[0] === encapser && str[str.length - 1]
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

    if (word === '>') {
      redirectSign = '>';
      redirectIndex = i;
    }

    if (word === '1>') {
      redirectSign = '1>';
      redirectIndex = i;
    }
  }

  return redirectIndex && redirectSign ? {redirectIndex, redirectSign} : null;
}

function generateOutput(command: {
    main: string;
    leftover: string[];
    leftoverWords: string[];
}): {
  output?: string,
  error?: string,
} {
    switch (command.main) {
    case (COMMAND_ACTION.Exit): {
      rl.close();
      return {output: COMMAND_ACTION.Exit};
    }

    case (COMMAND_ACTION.Echo): {
      return {output: `${command.leftover.join('')}`};
    }

    case (COMMAND_ACTION.Type): {
        const secondCommand = command.leftoverWords[0];

        if (!secondCommand) {
          return {};
        }

        const rawCommandsPool = Object.values(COMMAND_ACTION);

        if (rawCommandsPool.some(str => str === secondCommand)) {
          return {output: `${secondCommand} is a shell builtin`};
        }

        const exe = getExe(secondCommand);

        if (exe) {
          return {output: `${exe.fileName} is ${exe.filePath}`};
        }

        return {error: `${secondCommand} not found`};
    }

    case (COMMAND_ACTION.PWD): {
      return {output: process.cwd()};
    }

    case (COMMAND_ACTION.CD): {
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
        return {error: 'Command not found'};
      }

      return runExe(exe.fileName, args);
    }
  }
}

function redirectOutput(file: string, output: string) {
  fs.writeFileSync(file, output);
};

//Main flow
function processCommand(input: string) {
  let rawInputWords = processString(input);
  const redirect = detectRedirect(rawInputWords);

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
  };


  let {output: consoleOutput, error: consoleError} = generateOutput(command);

  if (consoleOutput === COMMAND_ACTION.Exit) {
    return true;
  }

  if (redirect?.fileArgs && (consoleOutput || consoleError)) {
    redirectOutput(redirect.fileArgs, consoleOutput || '');

    consoleOutput = undefined;
  }

  if (consoleError === 'Command not found') {
    consoleError =`${input}: command not found`;
  }

  const tmpOutput = (()=>{
    if (consoleOutput && !consoleError) {
      return consoleOutput
    }

    if(!consoleOutput && consoleError)
    return consoleError;

    if (consoleOutput && consoleError) {
      return consoleError + consoleOutput;
    }

    return null;
  })();
  tmpOutput && giveOutput(tmpOutput);
}

function REPL() {
  rl.question("$ ", function (input) {
    if (processCommand(input)) {
      return;
    }

    REPL();
  });
};

REPL();
