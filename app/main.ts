import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

enum Command {
  Exit = 'exit',
}

function  REPL() {
  rl.question("$ ", function (command) {
    if (command === Command.Exit) {
      rl.close();
      return;
    }

    console.log("".concat(command, ": command not found"));

    REPL();
  });
};

REPL();