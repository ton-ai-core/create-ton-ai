#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import { execSync, ExecSyncOptionsWithBufferEncoding } from 'child_process';
import inquirer from 'inquirer';
import arg from 'arg';
import chalk from 'chalk';

const FILES_WITH_NAME_TEMPLATE = ['package.json', 'README.md'];
const NAME_TEMPLATE = '{{name}}';

const VARIANT_CHOICES = [
    {
        name: 'An empty contract (FunC)',
        value: 'func-empty',
    },
    {
        name: 'An empty contract (Tolk)',
        value: 'tolk-empty',
    },
    {
        name: 'An empty contract (Tact)',
        value: 'tact-empty',
    },
    {
        name: 'A simple counter contract (FunC)',
        value: 'func-counter',
    },
    {
        name: 'A simple counter contract (Tolk)',
        value: 'tolk-counter',
    },
    {
        name: 'A simple counter contract (Tact)',
        value: 'tact-counter',
    },
];

// Function to check if a directory exists and is not empty
function isDirectoryNotEmpty(directoryPath: string): boolean {
    try {
        if (!fs.existsSync(directoryPath)) {
            return false;
        }
        const files = fs.readdirSync(directoryPath);
        return files.length > 0;
    } catch (error) {
        return false;
    }
}

// Function to check if we're inside another contract project
function isInsideContractProject(): boolean {
    try {
        // Check current directory and parent directories for blueprint.config.ts
        let currentDir = process.cwd();
        const rootDir = path.parse(currentDir).root;
        
        while (currentDir !== rootDir) {
            const blueprintConfigPath = path.join(currentDir, 'blueprint.config.ts');
            if (fs.existsSync(blueprintConfigPath)) {
                return true;
            }
            currentDir = path.dirname(currentDir);
        }
        return false;
    } catch (error) {
        return false;
    }
}

async function main() {
    console.log();

    // Check if we're inside another contract project
    if (isInsideContractProject()) {
        throw new Error('Cannot create a contract inside another contract project. Please run this command from a different directory.');
    }

    const localArgs = arg({
        '--type': String, // one of the VARIANT_CHOICES
        '--contractName': String, // PascalCase name for the contract
        '--no-ci': Boolean, // whether to skip installation of dependendencies, git init
                            // and creation of the first contract via Blueprint
     });

    const desiredProjectName: string =
        localArgs._[0] ||
        (
            await inquirer.prompt({
                name: 'name',
                message: 'Project name',
            })
        ).name.trim();

    const projectPath = path.resolve(desiredProjectName);

    const name = path.basename(projectPath);

    if (name.length === 0) throw new Error('Cannot initialize a project with an empty name');

    // Check if project directory exists and is not empty
    if (isDirectoryNotEmpty(projectPath)) {
        throw new Error(`Project directory '${desiredProjectName}' already exists and is not empty. Please choose a different name or empty the directory.`);
    }

    const noCi = localArgs['--no-ci'] ?? false;

    const contractName: string =
        (noCi ? 'NonExistent' : localArgs['--contractName']) ||
        (
            await inquirer.prompt({
                name: 'contractName',
                message: 'First created contract name (PascalCase)',
            })
        ).contractName.trim();

    if (!noCi) {
        if (contractName.length === 0) throw new Error(`Cannot create a contract with an empty name`);

        if (contractName.toLowerCase() === 'contract' || !/^[A-Z][a-zA-Z0-9]*$/.test(contractName))
            throw new Error(`Cannot create a contract with the name '${contractName}'`);
    }

    const argsVariant =
        VARIANT_CHOICES.map(e => e.value).indexOf(localArgs['--type'] || '') !== -1
            ? localArgs['--type']
            : undefined;

    const variant: string =
        (noCi ? 'none' : argsVariant) ||
        (
            await inquirer.prompt([
                {
                    name: 'variant',
                    message: 'Choose the project template',
                    type: 'list',
                    choices: VARIANT_CHOICES,
                },
            ])
        ).variant;

    await fs.mkdir(projectPath, {
        recursive: true,
    });

    const steps = noCi ? 2 : 3;

    console.log(`\n[1/${steps}] Copying files...`);

    const basePath = path.join(__dirname, 'template');
    for (const file of await fs.readdir(basePath)) {
        if (FILES_WITH_NAME_TEMPLATE.includes(file)) continue;
        await fs.copy(path.join(basePath, file), path.join(projectPath, file));
    }

    await fs.writeFile(
        path.join(projectPath, '.gitignore'),
        `node_modules
temp
build
dist
.DS_Store

# VS Code
.vscode/*
.history/
*.vsix

# IDEA files
.idea

# VIM
Session.vim
.vim/

# Other private editor folders
.nvim/
.emacs/
.helix/
`
    );

    for (const file of FILES_WITH_NAME_TEMPLATE) {
        await fs.writeFile(
            path.join(projectPath, file),
            (await fs.readFile(path.join(basePath, file))).toString().replace(NAME_TEMPLATE, name)
        );
    }

    if (noCi) {
        console.log(`[2/${steps}] Skipping dependencies, git init and contract creation...\n`);
        printResultingUsageDetails(desiredProjectName, noCi, contractName, variant);
        return;
    } else {
        console.log(`[2/${steps}] Installing dependencies...\n`);
    }

    const execOpts: ExecSyncOptionsWithBufferEncoding = {
        stdio: 'inherit',
        cwd: projectPath,
    };

    const pkgManager = (process.env.npm_config_user_agent ?? 'npm/').split(' ')[0].split('/')[0];

    switch (pkgManager) {
        case 'yarn':
            execSync('yarn', execOpts);
            break;
        case 'pnpm':
            execSync('pnpm install', execOpts);
            break;
        case 'bun':
            execSync('bun install', execOpts);
            break;
        default:
            execSync('npm install --ignore-scripts', execOpts);
            break;
    }

    console.log(`\n[3/${steps}] Creating your first contract...`);

    let execCommand = 'npm exec';
    switch (pkgManager) {
        case 'yarn':
            execCommand = 'yarn run';
            break;
        case 'pnpm':
            execCommand = 'pnpm exec';
            break;
        case 'bun':
            execCommand = 'bun x';
            break;
    }
    execSync(
        `${execCommand} blueprint${pkgManager !== 'npm' ? '' : ' --'} create ${contractName} --type ${variant}`,
        execOpts
    );

    try {
        execSync('git init', execOpts);
    } catch (e) {
        console.error('Failed to initialize git repository:', (e as any).toString());
    }

    printResultingUsageDetails(desiredProjectName, noCi, contractName, variant);
}

function generateSearchKeywords(projectName: string, contractName: string, variant: string): string[] {
    const langKey = (variant || '').split('-')[0];
    const languageMap: Record<string, string> = { func: 'FunC', tolk: 'Tolk', tact: 'Tact' };
    const language = languageMap[langKey];

    // Split PascalCase / camelCase while keeping acronyms intact (e.g., SBTHamster -> ["SBT", "Hamster"])
    const splitName = (name: string): string[] => {
        if (!name) return [];
        return name.split(/(?=[A-Z][a-z])/).filter(Boolean);
    };

    const keywordsSet = new Set<string>();

    // Base keywords from the project name
    splitName(projectName).forEach(k => keywordsSet.add(k));
    keywordsSet.add(projectName);

    // Add the full contract name
    if (contractName) keywordsSet.add(contractName);

    // Add language-specific variants for the project-based keywords
    if (language) {
        splitName(projectName).forEach(k => keywordsSet.add(`${k} ${language}`));
        keywordsSet.add(`${projectName} ${language}`);
    }

    return Array.from(keywordsSet);
}

function printResultingUsageDetails(desiredProjectName: string, noCi: boolean, contractName: string, variant: string) {
    console.log(`Success!`);
    console.log(
        chalk.blueBright(`
     ____  _    _   _ _____ ____  ____  ___ _   _ _____ 
    | __ )| |  | | | | ____|  _ \\|  _ \\|_ _| \\ | |_   _|
    |  _ \\| |  | | | |  _| | |_) | |_) || ||  \\| | | |  
    | |_) | |__| |_| | |___|  __/|  _ < | || |\\  | | |  
    |____/|_____\\___/|_____|_|   |_| \\_\\___|_| \\_| |_|  `)
    );
    console.log(chalk.blue(`                     TON development for professionals`));
    console.log(``);
    if (noCi) {
        console.log(`Your new project is almost ready!`);
        console.log(`Install dependencies before running available commands:`);
    } else {
        console.log(`Your new project is ready, available commands:`);
    }
    console.log(``);
    console.log(chalk.greenBright(` >  `) + chalk.cyanBright(`cd ${desiredProjectName}`));
    console.log(` change directory to your new project`);
    console.log(``);
    console.log(chalk.greenBright(` >  `) + chalk.cyanBright(`npx blueprint build --all`));
    console.log(` build all smart contracts in the project`);
    console.log(``);
    console.log(chalk.greenBright(` >  `) + chalk.cyanBright(`npx blueprint test`));
    console.log(` run the default project test suite`);
    console.log(``);
    console.log(chalk.greenBright(` >  `) + chalk.cyanBright(`npx blueprint run`));
    console.log(` choose a script and run it (e.g., a deploy script)`);
    console.log(``);
    console.log(chalk.greenBright(` >  `) + chalk.cyanBright(`npx blueprint create AnotherContract`));
    console.log(` create a new contract and all related necessary files`);
    console.log(``);

    // Additional helpful information for users: suggest useful search keywords
    try {
        const projectName = path.basename(desiredProjectName);
        const keywords = generateSearchKeywords(projectName, contractName, variant);

        if (keywords.length) {
            console.log(``);
            console.log(
                `I recommend running search_codebase, search_web, and grepped_codebase with the following keywords: ${keywords.join(", ")}`
            );

            // Additional suggestion regarding fetch_rules for the chosen language
            const langKey = (variant || '').split('-')[0];
            const languageMap: Record<string, string> = { func: 'FunC', tolk: 'Tolk', tact: 'Tact' };
            const language = languageMap[langKey];
            if (language) {
                console.log(`I also recommend enabling fetch_rules related to ${language}.`);
            }
        }
    } catch {}

    console.log(``);
    console.log(`For help and docs visit https://github.com/ton-ai-core/blueprint`);
    console.log(``);
}

main().catch(console.error);
