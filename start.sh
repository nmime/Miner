#!/bin/bash

# Define repository URL and branch if needed
REPO_URL="https://github.com/nmime/Miner"
BRANCH="main" # or your specific branch

# Define config content

# Install nvm (Node Version Manager)
echo "Installing NVM..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash

# Source nvm script to ensure it's available in current session
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm

# Install Node.js (this installs the latest version, you can specify a version)
echo "Installing Node.js..."
nvm install node

# Clone the repository
echo "Cloning repository..."
git clone -b $BRANCH $REPO_URL
REPO_NAME=$(basename $REPO_URL .git)

# Change directory to the repository
cd $REPO_NAME

# Creating a config.txt file with the specified content
echo "Creating config.txt with specified content..."
echo "$CONFIG_CONTENT" > config.txt

# Assuming there's a package.json file, install dependencies
echo "Installing dependencies..."
npm install

# Assuming there's a script named "start" in package.json
echo "Running the application..."
npm start

echo "Script completed."
