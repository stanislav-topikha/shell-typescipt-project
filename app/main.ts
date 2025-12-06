import { createInterface } from "readline";

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
          const tmpCommand = command.rest ||'_error_';

          console.log(
            normalizeCommand(tmpCommand).action !== CommandAction.Unknown
              ? `${tmpCommand} is a shell builtin`
              : `${tmpCommand} not found`
          );
        }
        break;

      case(CommandAction.Unknown):
        console.log("".concat(input, ": command not found"));
    }

    REPL();
  });
};

REPL();