#!/bin/bash

declare -a queries=(
  #"dph < 8 num_gpus>=3 gpu_name=RTX_4090 rented=False"
  "dph < 1.7 num_gpus>=1 num_gpus<8 gpu_name=RTX_4090 rented=False"
  #"num_gpus=>8 gpu_name=RTX_3090 rented=False"
  #"dph < 4 num_gpus>=3 num_gpus<8 gpu_name=RTX_3090 rented=False"

  #"dph < 1 num_gpus>=1 num_gpus<3 gpu_name=RTX_3090 rented=False"
  
  #"num_gpus>8 gpu_name=RTX_3090 rented=False"
  #"dph < 6 num_gpus=8 gpu_name=RTX_3090 rented=False"
  #"dph < 4 num_gpus=4 gpu_name=RTX_3090 rented=False"
  #"dph < 1 num_gpus=2 gpu_name=RTX_3090 rented=False"
  #"dph < 0.5 num_gpus=1 gpu_name=RTX_3090 rented=False"
)

process_query() {
  local query="$1"
  
  while IFS= read -r line; do
    id=$(echo "$line" | awk '{print $1}')
    n=$(echo "$line" | awk '{print $3}')
    gpu_name=$(echo "$line" | awk '{print $4}')
    price_per_hr=$(echo "$line" | awk '{print $9}')
    
    echo "$id | GPU: $gpu_name, GPUs: $n, Price/hr: $price_per_hr"

    local success=false
    local max_attempts=5
    local attempts=0

    while [[ "$success" == "false" && "$attempts" -lt "$max_attempts" ]]; do
      response=$(vastai create instance $id --image nvidia/cuda:12.0.1-devel-ubuntu20.04 --env 'null' --disk 11 --ssh --cancel-unavai --onstart-cmd "$(cat <<'END_SCRIPT'
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

chmod +x /root/Miner/pow-miner-cuda

cd $REPO_NAME
git pull

echo "$CONFIG_CONTENT" > config.txt

npm i
npm start
END_SCRIPT
)")

      echo "$id | Response: $response"

      if [[ "$response" == *"'success': True"* ]]; then
        success=true
        echo "$id | Instance creation successful"
      elif [[ $response == *"is no longer available"* ]]; then
        echo "$id | Not longer available"
        return
      elif [[ $response == *"is not available"* ]]; then
        echo "$id | Not available"
        return
      elif [[ $response == *"429"* ]]; then
        echo "$id | 429"
        return
      else
        echo "$id | Instance creation failed, attempt $((attempts + 1))/$max_attempts"
        ((attempts++))
        sleep 1
      fi
    done

    if [[ "$success" == "false" ]]; then
      echo "$id | Failed to create instance after $max_attempts attempts."
    fi
  done < <(vastai search offers "$query" | awk '/^[0-9]+/')
}

while true; do
  echo "Searching for offers..."

  for query in "${queries[@]}"; do
    process_query "$query" &
  done
  
  sleep 0.1

done
