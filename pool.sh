apt update
apt install nvidia-opencl-dev
apt install nvidia-opencl-icd-340
apt install clinfo

wget https://ton.ninja/grampool.tar.gz
tar -xzf grampool.tar.gz

cd grampool
./miningPoolCli -pool-id=UQA3m5hVR9-Wt8tjZl1SVVlOKXhp4NM0O78qzzz45HusF4A0 -url https://api.ton.ninja