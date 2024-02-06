const axios = require("axios");

const token =
  "9f9835a1b44d0c61b404d51181a712f51c13fbc2a188b86420b2043248a2ea82";

let sleepTime = 1000;

function sleep(millis) {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

async function createInstance(id) {
  const body = {
    image: "nvidia/cuda:12.0.1-devel-ubuntu20.04",
    disk: 11,
    ssh: true,
    cancel_unavail: true,
    onstart: `#!/bin/bash
  apt update -y
  
  wget https://ton.ninja/miningPoolCli-3.0.3-linux.tar.gz
  tar -xzf miningPoolCli-3.0.3-linux.tar.gz
  
  cd miningPoolCli-3.0.3
  ./miningPoolCli -pool-id=UQA3m5hVR9-Wt8tjZl1SVVlOKXhp4NM0O78qzzz45HusF4A0 -url https://ninja.tonlens.com
      `,
  };

  return axios.put(`https://cloud.vast.ai/api/v0/asks/${id}/`, body, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

async function requestOffers(id) {
  const payloads = [
    /*{
      disk_space: { gte: 10 },
      dph_total: { lte: 1.2 },
      type: "on-demand",
      rented: { eq: false },
      rentable: { eq: true },
      gpu_name: { eq: "RTX 4090" },
      num_gpus: { gte: 0, lte: 3 },
    },*/
    {
      disk_space: { gte: 10 },
      dph_total: { lte: 2 },
      type: "on-demand",
      rented: { eq: false },
      rentable: { eq: true },
      gpu_name: { eq: "RTX 4090" },
      num_gpus: { gte: 4 },
    },
    {
      disk_space: { gte: 10 },
      dph_total: { lte: 3 },
      type: "on-demand",
      rented: { eq: false },
      rentable: { eq: true },
      gpu_name: { eq: "RTX 4090" },
      num_gpus: { gte: 6 },
    },
    {
      disk_space: { gte: 10 },
      type: "on-demand",
      dph_total: { lte: 8 },
      rented: { eq: false },
      rentable: { eq: true },
      gpu_name: { eq: "RTX 4090" },
      num_gpus: { gte: 8 },
    },
  ];

  return axios.get(
    `https://cloud.vast.ai/api/v0/bundles/?q=${JSON.stringify(payloads[id])}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
}

void (async () => {
  while (true) {
    await Promise.all(
      [0, 1, 2, 3].map((i) =>
        requestOffers(i)
          .then(async (data) => {
            if (data.data.offers.length)
              await Promise.all(
                data.data.offers.map((instance) =>
                  createInstance(instance.id)
                    .then((responce) => console.log(responce.data))
                    .catch(handleError)
                )
              );
          })
          .catch(handleError)
      )
    );

    await sleep(sleepTime);
  }
})();

function handleError(error) {
  if (error.response) {
    if (error.response.status) sleepTime += 50;

    console.error("Error status:", error.response.data, error.response.status);
  } else if (error.request) {
    console.error("Error Request:", error.request);
  } else {
    console.error("Error Message:", error.message);
  }
}
