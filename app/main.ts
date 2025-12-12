import { execFileSync } from "node:child_process";
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
  let result = null;

  for (const tmpPath of pathArr) {
    if (result) {
      break;
    }

    try {
      const filePath = path.join(tmpPath, xFileName);

      fs.accessSync(filePath, fs.constants.X_OK);
      result =  {
        fileName: xFileName,
        filePath,
      };

    } catch {}
  }

  return result;
}

function runExe(exeName: string, args: string[]) {
  let output: null|string = null;

  try {
    const buffer = args.length
      ? execFileSync(exeName, args)
      : execFileSync(exeName);

    output = buffer.toString();
  } catch {}

  return output;
}

function giveOutput(input:string) {
  const output = input.endsWith('\n')
    ? input
    : `${input}\n`;

  process.stdout.write(output);
}

const isWord = (srt: string) => !!srt.trim();

function processString(str: string) {
  const regexp = RegExp(/('.+?')|(".+?")|(\s+)|([^\s'"]+)/g);
  const tmpWords = str.match(regexp) || [];
  const isEncapsed = (str: string, encapser: `'` | `"`) => {
    return str.at(0) === encapser && str.at(-1) === encapser
  };

  return tmpWords.map((string) => {
    return isEncapsed(string, `'`) || isEncapsed(string, `"`)
      ? string.slice(1, -1)
      : string.replaceAll(/\s+/g,' ');
  }).filter(Boolean);
}

function processCommand(input: string) {
  let consoleOutput: null | string = null;
  const rawInputWords = processString(input);
  const mainCommandIndex = rawInputWords.findIndex(isWord);

  const command = {
    main: rawInputWords[mainCommandIndex],
    leftover: rawInputWords.slice(mainCommandIndex + 2),
    leftoverWords: rawInputWords.slice(mainCommandIndex + 2).filter(isWord),
  };

  switch (command.main) {
    case (COMMAND_ACTION.Exit): {
      rl.close();
      return true;
    }

    case (COMMAND_ACTION.Echo): {
      consoleOutput = `${command.leftover.join('')}`;
      break;
    }

    case (COMMAND_ACTION.Type): {
        const secondCommand = command.leftoverWords[0];
        const rawCommandsPool = Object.values(COMMAND_ACTION);
        let tmpResult: null | string = null;

        if (rawCommandsPool.some(str => str ===secondCommand)) {
          tmpResult = `${secondCommand} is a shell builtin`;
        }

        if (!tmpResult) {
          const exe = getExe(secondCommand);
          tmpResult = (
            exe && `${exe.fileName} is ${exe.filePath}`
          ) ?? (
            `${secondCommand} not found`
          );
        }

        consoleOutput = tmpResult;

        break;
      }

    case (COMMAND_ACTION.PWD): {
      consoleOutput = process.cwd();
      consoleOutput ??= 'PWD failed';

      break;
    }

    case (COMMAND_ACTION.CD): {
      const tmpPath = command.leftoverWords[0];

      try {
        const homePath = process.env['HOME'];
        const tmpLeftover = typeof homePath === 'string' && tmpPath.startsWith('~')
          ? tmpPath.replace('~', homePath)
          : tmpPath;

        process.chdir(tmpLeftover);
        return;
      } catch {
        consoleOutput = `cd: ${tmpPath}: No such file or directory`
      }
      break;
    }


    default: {
      const exe = getExe(command.main);
      const args = command.leftoverWords;
      consoleOutput ??= exe && runExe(exe.fileName, args);

      consoleOutput ??= `${input}: command not found`;
    }
  }

  giveOutput(consoleOutput);
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
