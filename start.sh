#!/bin/bash

REPO_URL="https://github.com/nmime/Miner"
BRANCH="main"

CONFIG_CONTENT=$(cat <<'END_HEREDOC'
END_HEREDOC
)

echo "Installing NVM..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash

export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm

echo "Installing Node.js..."
nvm install node

echo "Cloning repository..."
git clone -b $BRANCH $REPO_URL
REPO_NAME=$(basename $REPO_URL .git)
git pull

chmod +x /root/Miner/pow-miner-cuda

cd $REPO_NAME

echo "Creating config.txt with specified content..."
echo "$CONFIG_CONTENT" > config.txt

echo "Installing dependencies..."
npm install

echo "Running the application..."
npm start

echo "Script completed."
