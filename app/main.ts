import { spawnSync } from "node:child_process";
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

const isEncapsed = (s: string, q: `'` | `"`) => {
  return s.length >= 2 && s.startsWith(q) && s.endsWith(q);
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
  '2>': '2>'
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

    if (!(
      REDIRECT_SIGN[">"] === word
    ||REDIRECT_SIGN["1>"] === word
    ||REDIRECT_SIGN["2>"] === word
    )) {
      continue;
    }

    redirectSign = word;
    redirectIndex = i;
  }

  return (redirectIndex !== null) && redirectSign
    ? {redirectIndex, redirectSign}
    : null;
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
      return {};
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

  let {
    output: consoleOutput = null,
    error: consoleError = null
  } = generateOutput(command);

  if (command.main === COMMAND_ACTION.Exit) {
    //stops REPL
    return true;
  }

  if (redirect?.fileArgs && redirect.redirectSign !== '2>') {
    redirectOutput(redirect.fileArgs, consoleOutput || '');
    consoleOutput = null;
  }

  if (redirect?.fileArgs && redirect.redirectSign === '2>') {
    redirectOutput(redirect.fileArgs, consoleError || '');
    consoleError = null;
  }

  // change condition
  if (consoleError === 'Command not found') {
    consoleError =`${input}: command not found`;
  }

  if (!consoleError && !consoleOutput) {
    return;
  }

  giveOutput((consoleError??'') + (consoleOutput??''));
}

function REPL() {
  rl.question("$ ", function (input) {
    const stop = Boolean(processCommand(input));

    if (stop) {
      return;
    }

    REPL();
  });
};

REPL();
