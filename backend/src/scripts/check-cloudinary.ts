import "dotenv/config";
import { getCloudinary } from "../lib/cloudinary.js";

async function main() {
  const cloudinary = getCloudinary();
  console.log("Checking Cloudinary resources...");
  try {
    const res = await cloudinary.api.resources({
      type: "upload",
      prefix: "oceanic-tools",
      max_results: 100,
    });
    console.log("Cloudinary resources under oceanic-tools:", res.resources.length);
    for (const r of res.resources) {
      console.log(`- ${r.public_id} (${r.secure_url})`);
    }
  } catch (err) {
    console.error("Cloudinary check failed:", err);
  }
}

main();
