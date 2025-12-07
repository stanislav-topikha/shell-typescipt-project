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
  } catch {
  }

  return output;
}

function processCommand(input: string) {
  let consoleOutput: null | string = null;

  const rawInputWords = input.split(' ');
  const command = {
    main: rawInputWords[0],
    leftover: rawInputWords.slice(1).join(' '),
  };

  switch (command.main) {
    case (COMMAND_ACTION.Exit):
      rl.close();
      return true;

    case (COMMAND_ACTION.Echo):
      consoleOutput = `${command.leftover}`;
      break;

    case (COMMAND_ACTION.Type):
      {
        const secondCommand = command.leftover;
        const rawCommandsPool = Object.values(COMMAND_ACTION);

        let tmpResult: null | string = null;

        //@ts-expect-error
        if (rawCommandsPool.includes(secondCommand)) {
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
      }
      break;

    default:
      const exe = getExe(command.main);
      const args = command.leftover.split(' ').map(s => s.trim()).filter(Boolean);
      consoleOutput ??= exe && runExe(exe.fileName, args);

      consoleOutput ??= `${input}: command not found`;
  }
    consoleOutput = consoleOutput.endsWith('\n')
      ? consoleOutput
      : `${consoleOutput}\n`;

    process.stdout.write(consoleOutput);
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
