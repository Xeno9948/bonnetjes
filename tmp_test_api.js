
async function test() {
  const token = "b5fab14d-500d-4d4c-a24d-47c3b9a30c0d";
  const url = "https://www.kiyoh.com/v1/publication/review/external?locationId=1409511&tenantId=98&limit=5";
  
  try {
    const res = await fetch(url, {
      headers: { "X-Publication-Api-Token": token }
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Data:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
