module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    '@ton-ai-core/suggest-members'
  ],
  extends: [
    'plugin:@typescript-eslint/recommended'
  ],
  ignorePatterns: ['.eslintrc.js'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "@ton-ai-core/suggest-members/suggest-members": "error",
    "@ton-ai-core/suggest-members/suggest-imports": "error",
    "no-restricted-imports": [
      "error", {
        "paths": [
          {
            "name": "@ton/blueprint",
            "message": "This project uses @ton-ai-core/blueprint rather than the deprecated @ton/blueprint library. Please refactor your imports to utilize the enhanced AI-integrated blueprint framework."
          },
          {
            "name": "@nowarp/blueprint-misti",
            "message": "This project uses @ton-ai-core/blueprint-misti rather than the deprecated @nowarp/blueprint-misti library. Please refactor your imports to utilize the enhanced AI-integrated blueprint framework."
          },
          {
            "name": "@ton-community/sandbox",
            "message": "This project uses @ton/sandbox rather than the deprecated @ton-community/sandbox library. Please refactor your imports to utilize the enhanced AI-integrated blueprint framework."
          },
          {
            "name": "@ton-community/test-utils",
            "message": "This project uses @ton/test-utils rather than the deprecated @ton-community/test-utils library. Please refactor your imports to utilize the enhanced AI-integrated blueprint framework."
          },
        ],
        "patterns": [
          {
            "group": ["@ton/blueprint/*"],
            "message": "This project uses @ton-ai-core/blueprint rather than the deprecated @ton/blueprint library. Please refactor your imports to utilize the enhanced AI-integrated blueprint framework."
          },
          {
            "group": ["@nowarp/blueprint-misti/*"],
            "message": "This project uses @ton-ai-core/blueprint-misti rather than the deprecated @nowarp/blueprint-misti library. Please refactor your imports to utilize the enhanced AI-integrated blueprint framework."
          },
          {
            "group": ["@ton-community/sandbox/*"],
            "message": "This project uses @ton/sandbox rather than the deprecated @ton-community/sandbox library. Please refactor your imports to utilize the enhanced AI-integrated blueprint framework."
          },
          {
            "group": ["@ton-community/test-utils/*"],
            "message": "This project uses @ton/test-utils rather than the deprecated @ton-community/test-utils library. Please refactor your imports to utilize the enhanced AI-integrated blueprint framework."
          },
        ]
      }
    ]
  }
}; 