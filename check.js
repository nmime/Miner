const axios = require("axios");
const fs = require("fs").promises;

const token =
  "9f9835a1b44d0c61b404d51181a712f51c13fbc2a188b86420b2043248a2ea82";

void (async () => {
  function sleep(millis) {
    return new Promise((resolve) => setTimeout(resolve, millis));
  }

  let badInstances = JSON.parse(await fs.readFile("dump.json"));

  while (true) {
    badInstances = JSON.parse(await fs.readFile("dump.json"));

    const instances = await axios
      .get(`https://console.vast.ai/api/v0/instances`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .catch(handleError);

    if (!instances?.data?.instances) {
      await sleep(500);
      continue;
    }

    for (const instance of instances.data.instances) {
      const find = badInstances.find((e) => e.id === instance.id);

      if (find && instance.gpu_util > 50)
        badInstances.splice(
          badInstances.findIndex((e) => e.id === instance.id),
          1
        );
      else if (instance.gpu_util > 1) continue;

      if (!find) badInstances.push({ id: instance.id, times: 1 });
      else {
        if (
          find.times >= 6 ||
          instance.status_msg?.includes("Error response from daemon")
        ) {
          await axios
            .delete(`https://cloud.vast.ai/api/v0/instances/${instance.id}/`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            })
            .then((responce) => {
              console.log(responce.data);

              badInstances.splice(
                badInstances.findIndex((e) => e.id === instance.id),
                1
              );
            })
            .catch(handleError);
        } else if (find.times >= 2 && find.times < 6)
          await axios
            .put(
              `https://cloud.vast.ai/api/v0/instances/reboot/${instance.id}/`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            )
            .then((responce) => console.log(responce.data))
            .catch(handleError);

        find.times++;
      }
    }

    console.log(badInstances);

    await fs.writeFile("dump.json", JSON.stringify(badInstances, null, 2));

    await sleep(60000);
  }
})();

function handleError(error) {
  if (error.response) {
    console.error("Error Data:", error.response.data, error.response.status);
  } else if (error.request) {
    console.error("Error Request:", error.request);
  } else {
    console.error("Error Message:", error.message);
  }
}
