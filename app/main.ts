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
  const rawInputWords = input.split(' ');
  const command = {
    action: rawInputWords[0],
    leftover: rawInputWords.slice(1).join(' '),
  };


  switch (command.action) {
    case (COMMAND_ACTION.Exit):
      rl.close();
      return;

    case (COMMAND_ACTION.Echo):
      console.log(`${command.leftover}`);
      break;

    case (COMMAND_ACTION.Type):
      {
        const secondCommand = command.leftover;
        const rawCommandsPool = Object.values(COMMAND_ACTION);

        if (!secondCommand) {
          break;
        }

        let typeResult: null | string = null;

        //@ts-expect-error
        if (rawCommandsPool.includes(secondCommand)) {
          typeResult = `${secondCommand} is a shell builtin`;
        }

        if (!typeResult) {
          typeResult = locateExecutableFile(secondCommand);
        }

        console.log(typeResult ?? `${secondCommand} not found`);
      }
      break;

    default:
      console.log("".concat(input, ": command not found"));
  }
}

function REPL() {
  rl.question("$ ", function (input) {
    processCommand(input);

    REPL();
  });
};

REPL();
