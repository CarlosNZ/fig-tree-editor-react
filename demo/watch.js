// Watch parent repo for changes and updates inner copy if so
import { execSync } from "child_process";

console.log("Relaunching...");

// Expression Editor
execSync("cp -R ../src/* ./src/expression-builder/src");
execSync("cp ../package.json ./src/expression-builder");
