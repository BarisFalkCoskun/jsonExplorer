module.exports = require("next/jest")()({
  moduleDirectories: ["<rootDir>", "node_modules"],
  moduleNameMapper: {
    // bson ships ESM-first; force CJS for Jest's jsdom environment
    "^bson$": "<rootDir>/node_modules/bson/lib/bson.cjs",
  },
  testEnvironment: "jest-environment-jsdom",
  testPathIgnorePatterns: ["<rootDir>/e2e/"],
});
