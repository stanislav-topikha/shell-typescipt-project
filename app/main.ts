import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});


function  REPL() {
  rl.question("$ ", function (command) {
    console.log("".concat(command, ": command not found"));
    REPL();
  });
};

REPL();