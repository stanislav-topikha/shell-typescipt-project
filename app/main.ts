import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

enum CommandAction {
  Exit = 'exit',
  Unknown = 'unknown',
  Echo = 'echo',
}

function REPL() {
  rl.question("$ ", function (input) {
    const normalizeCommand = ((rawInput) => {
      const rawInputWords = rawInput.split(' ');
      const firstWord = rawInputWords[0];
      const restOfInput = rawInputWords.slice(1).join(' ');

      switch(firstWord) {
        case(CommandAction.Exit):
          return {
            action: CommandAction.Exit,
          };
        case(CommandAction.Echo):
          return {
            action: CommandAction.Echo,
            rest: restOfInput,
          }
        default:
          return {
            action: CommandAction.Unknown,
          }
      }
    })(input);

    switch(normalizeCommand.action) {
      case(CommandAction.Exit):
        rl.close();
        return;

      case(CommandAction.Echo):
        console.log(`${normalizeCommand.rest}`);
        break;

      case(CommandAction.Unknown):
        console.log("".concat(input, ": command not found"));
    }

    REPL();
  });
};

REPL();