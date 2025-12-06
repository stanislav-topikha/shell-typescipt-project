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

function locateExecutableFile(xFileName: string){
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
      result = `${xFileName} is ${filePath}`;

    } catch {}
  }

  return result;
}

function processCommand(input: string) {
  let consoleOutput = '';

  const rawInputWords = input.split(' ');
  const command = {
    main: rawInputWords[0],
    leftover: rawInputWords.slice(1).join(' '),
  };


  switch (command.main) {
    case (COMMAND_ACTION.Exit):
      rl.close();
      return;

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
          tmpResult = locateExecutableFile(secondCommand);
        }

        consoleOutput = tmpResult ?? `${secondCommand} not found`;
      }
      break;

    default:
      consoleOutput = `${input}: command not found`;
  }

  console.log(consoleOutput);
}

function REPL() {
  rl.question("$ ", function (input) {
    processCommand(input);

    REPL();
  });
};

REPL();
