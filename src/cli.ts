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

// Function to generate project tree structure
function generateProjectTree(directoryPath: string, prefix: string = '', maxDepth: number = 3, currentDepth: number = 0): string[] {
    const tree: string[] = [];
    
    if (currentDepth >= maxDepth) {
        tree.push(`${prefix}└── ... (max depth reached)`);
        return tree;
    }

    try {
        if (!fs.existsSync(directoryPath)) {
            return tree;
        }

        const items = fs.readdirSync(directoryPath);
        
        // Filter out unwanted directories and files
        const filteredItems = items.filter(item => {
            const itemPath = path.join(directoryPath, item);
            const isDirectory = fs.statSync(itemPath).isDirectory();
            
            // Skip node_modules, .git, and other common directories
            if (isDirectory && (
                item === 'node_modules' || 
                item === '.git' || 
                item === 'dist' || 
                item === 'build' || 
                item === 'temp' ||
                item === '.next' ||
                item === '.nuxt' ||
                item === '.cache' ||
                item === 'coverage' ||
                item === '.nyc_output'
            )) {
                return false;
            }
            
            // Skip common files that are not important for project structure
            if (!isDirectory && (
                item === '.DS_Store' ||
                item === 'Thumbs.db' ||
                item === '.gitignore' ||
                item === '.npmignore' ||
                item === 'package-lock.json' ||
                item === 'yarn.lock' ||
                item === 'pnpm-lock.yaml'
            )) {
                return false;
            }
            
            return true;
        });

        const sortedItems = filteredItems.sort((a, b) => {
            const aIsDir = fs.statSync(path.join(directoryPath, a)).isDirectory();
            const bIsDir = fs.statSync(path.join(directoryPath, b)).isDirectory();
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.localeCompare(b);
        });

        for (let i = 0; i < sortedItems.length; i++) {
            const item = sortedItems[i];
            const itemPath = path.join(directoryPath, item);
            const isLast = i === sortedItems.length - 1;
            const isDirectory = fs.statSync(itemPath).isDirectory();
            
            const connector = isLast ? '└── ' : '├── ';
            const nextPrefix = isLast ? '    ' : '│   ';
            
            if (isDirectory) {
                tree.push(`${prefix}${connector}${item}/`);
                const subItems = fs.readdirSync(itemPath);
                if (subItems.length > 0) {
                    const subTree = generateProjectTree(itemPath, prefix + nextPrefix, maxDepth, currentDepth + 1);
                    tree.push(...subTree);
                }
            } else {
                tree.push(`${prefix}${connector}${item}`);
            }
        }
    } catch (error) {
        tree.push(`${prefix}└── ... (error reading directory)`);
    }
    
    return tree;
}

// Function to format project tree with file counts
function formatProjectTree(directoryPath: string): string {
    try {
        if (!fs.existsSync(directoryPath)) {
            return 'Directory does not exist';
        }

        const tree = generateProjectTree(directoryPath);
        const projectName = path.basename(directoryPath);
        
        // Count files in each directory
        const dirCounts: Record<string, number> = {};
        const countFilesInDir = (dirPath: string): number => {
            try {
                const items = fs.readdirSync(dirPath);
                let count = 0;
                for (const item of items) {
                    const itemPath = path.join(dirPath, item);
                    const isDirectory = fs.statSync(itemPath).isDirectory();
                    
                    // Skip unwanted directories and files
                    if (isDirectory && (
                        item === 'node_modules' || 
                        item === '.git' || 
                        item === 'dist' || 
                        item === 'build' || 
                        item === 'temp' ||
                        item === '.next' ||
                        item === '.nuxt' ||
                        item === '.cache' ||
                        item === 'coverage' ||
                        item === '.nyc_output'
                    )) {
                        continue;
                    }
                    
                    if (!isDirectory && (
                        item === '.DS_Store' ||
                        item === 'Thumbs.db' ||
                        item === '.gitignore' ||
                        item === '.npmignore' ||
                        item === 'package-lock.json' ||
                        item === 'yarn.lock' ||
                        item === 'pnpm-lock.yaml'
                    )) {
                        continue;
                    }
                    
                    if (isDirectory) {
                        count += countFilesInDir(itemPath);
                    } else {
                        count++;
                    }
                }
                return count;
            } catch {
                return 0;
            }
        };

        // Add file counts to directory lines
        const formattedTree = tree.map(line => {
            if (line.includes('/') && !line.includes('...')) {
                const dirName = line.split('/')[0].split('── ').pop() || '';
                const dirPath = path.join(directoryPath, dirName);
                if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
                    const fileCount = countFilesInDir(dirPath);
                    return `${line} (${fileCount} files)`;
                }
            }
            return line;
        });

        return `${projectName}/\n${formattedTree.join('\n')}`;
    } catch (error) {
        return 'Error generating project tree';
    }
}

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

// Function to find the nearest contract project
function findNearestContractProject(): string | null {
    try {
        let currentDir = process.cwd();
        const rootDir = path.parse(currentDir).root;
        
        while (currentDir !== rootDir) {
            const blueprintConfigPath = path.join(currentDir, 'blueprint.config.ts');
            if (fs.existsSync(blueprintConfigPath)) {
                return currentDir;
            }
            currentDir = path.dirname(currentDir);
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function main() {
    console.log();

    // Check if we're inside another contract project
    if (isInsideContractProject()) {
        const nearestProject = findNearestContractProject();
        console.log(chalk.red('❌ Error: Cannot create a contract inside another contract project.'));
        console.log(chalk.yellow('Please run this command from a different directory.'));
        
        if (nearestProject) {
            console.log(chalk.cyan('\n📁 You are currently inside this contract project:'));
            console.log(chalk.cyan(`   ${nearestProject}`));
            console.log(chalk.cyan('\n📂 Project structure:'));
            console.log(chalk.gray('```'));
            console.log(formatProjectTree(nearestProject));
            console.log(chalk.gray('```'));
        }
        
        console.log(chalk.yellow('\n💡 Solution: Change to a different directory and try again.'));
        process.exit(1);
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

    if (name.length === 0) {
        console.log(chalk.red('❌ Error: Cannot initialize a project with an empty name.'));
        process.exit(1);
    }

    // Check if project name contains only English letters and digits
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
        console.log(chalk.red(`❌ Error: Project name '${name}' is invalid.`));
        console.log(chalk.yellow('Name must start with a capital letter and contain only English letters and digits.'));
        process.exit(1);
    }

    // Check if project directory exists and is not empty
    if (isDirectoryNotEmpty(projectPath)) {
        console.log(chalk.red(`❌ Error: Project directory '${desiredProjectName}' already exists and is not empty.`));
        console.log(chalk.yellow('Please use a different project name or edit the existing project.'));
        
        console.log(chalk.cyan('\n📂 Current project structure:'));
        console.log(chalk.gray('```'));
        console.log(formatProjectTree(projectPath));
        console.log(chalk.gray('```'));
        
        console.log(chalk.yellow('\n💡 Solutions:'));
        console.log(chalk.yellow('   1. Use a different project name'));
        console.log(chalk.yellow('   2. Edit the existing project instead of creating a new one'));
        process.exit(1);
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
        if (contractName.length === 0) {
            console.log(chalk.red('❌ Error: Cannot create a contract with an empty name.'));
            process.exit(1);
        }

        if (contractName.toLowerCase() === 'contract') {
            console.log(chalk.red(`❌ Error: Cannot create a contract with the name '${contractName}' - this name is reserved.`));
            process.exit(1);
        }

        if (!/^[A-Z][a-zA-Z0-9]*$/.test(contractName)) {
            console.log(chalk.red(`❌ Error: Contract name '${contractName}' is invalid.`));
            console.log(chalk.yellow('Name must start with a capital letter and contain only English letters and digits.'));
            process.exit(1);
        }
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
    try {
        execSync(
            `${execCommand} blueprint${pkgManager !== 'npm' ? '' : ' --'} create ${contractName} --type ${variant}`,
            execOpts
        );
    } catch (e) {
        console.log(chalk.red('❌ Error: Failed to create contract.'));
        console.log(chalk.yellow('This might be due to:'));
        console.log(chalk.yellow('   - Missing dependencies'));
        console.log(chalk.yellow('   - Network connectivity issues'));
        console.log(chalk.yellow('   - Invalid contract type'));
        console.log(chalk.gray(`\nTechnical details: ${(e as any).toString()}`));
        process.exit(1);
    }

    try {
        execSync('git init', execOpts);
    } catch (e) {
        console.log(chalk.yellow('⚠️  Warning: Failed to initialize git repository.'));
        console.log(chalk.gray(`Technical details: ${(e as any).toString()}`));
    }

    printResultingUsageDetails(desiredProjectName, noCi, contractName, variant);
}

main().catch((error) => {
    console.log(chalk.red('❌ Unexpected error occurred:'));
    console.log(chalk.red(error.message || error.toString()));
    console.log(chalk.yellow('\n💡 Please check your input and try again.'));
    process.exit(1);
});

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
