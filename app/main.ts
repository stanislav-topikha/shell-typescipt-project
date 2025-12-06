import * as fs from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline";


const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

enum CommandAction {
  Exit = 'exit',
  Unknown = 'unknown',
  Echo = 'echo',
  Type = 'type',
}

function normalizeCommand(rawInput: string) {
  const rawInputWords = rawInput.split(' ');
  const firstWord = rawInputWords[0];
  const restOfInput = rawInputWords.slice(1).join(' ');

  switch (firstWord) {
    case (CommandAction.Exit):
      return {
        action: CommandAction.Exit,
      };
    case (CommandAction.Echo):
      return {
        action: CommandAction.Echo,
        rest: restOfInput,
      }
    case (CommandAction.Type):
      return {
        action: CommandAction.Type,
        rest: restOfInput,
      }
    default:
      return {
        action: CommandAction.Unknown,
      }
  }
};

function locateExecutableFile(xFileName: string){
  const pathArr = process.env.PATH?.split(path.delimiter) || [];
  let result: string | null = null;

  for (const tmpPath of pathArr) {
    if (result) {
      break;
    }

    try {
      const files = fs.readdirSync(path.join(tmpPath), {withFileTypes: true});

      for (const file of files) {
        if(file.name === xFileName) {
          const filePath = path.join(tmpPath, file.name);

          try {
            fs.accessSync(filePath, fs.constants.X_OK);
            result = `${file.name} is ${filePath}`;
          } catch {}

          break;
        }
      }
    } catch {}
  }

  return result;
}

console.log(locateExecutableFile('pfctl'));

function REPL() {
  rl.question("$ ", function (input) {
    const command = normalizeCommand(input);

    switch(command.action) {
      case(CommandAction.Exit):
        rl.close();
        return;

      case(CommandAction.Echo):
        console.log(`${command.rest}`);
        break;

      case(CommandAction.Type):
        {
          const tmpCommand = command.rest;

          if (!tmpCommand) {
            break;
          }

          let typeResult: null | string = null;

          if (normalizeCommand(tmpCommand).action !== CommandAction.Unknown) {
            typeResult = `${tmpCommand} is a shell builtin`;
          }

          if (!typeResult) {
            typeResult = locateExecutableFile(tmpCommand);
          }

          console.log(typeResult ?? `${tmpCommand} not found`);
        }
        break;

      case(CommandAction.Unknown):
        console.log("".concat(input, ": command not found"));
    }

    REPL();
  });
};

REPL();
