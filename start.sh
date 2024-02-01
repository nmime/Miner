#!/bin/bash

REPO_URL="https://github.com/nmime/Miner"

CONFIG_CONTENT=$(cat <<'END_HEREDOC'
END_HEREDOC
)

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash

export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install node

git clone $REPO_URL
REPO_NAME=$(basename $REPO_URL .git)
git pull

chmod +x /root/Miner/pow-miner-cuda

cd $REPO_NAME

echo "$CONFIG_CONTENT" > config.txt

npm i
npm start