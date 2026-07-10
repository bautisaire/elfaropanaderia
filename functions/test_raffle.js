const admin = require("firebase-admin");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

admin.initializeApp();
const db = admin.firestore();

async function check() {
    console.log("Checking active raffles...");
    const snap = await db.collection("raffles").where("isActive", "==", true).limit(1).get();
    if (snap.empty) {
        console.log("No active raffle found.");
    } else {
        const raffle = snap.docs[0];
        console.log("Active Raffle:", raffle.id, raffle.data());
        
        const parts = await db.collection(`raffles/${raffle.id}/participants`).get();
        console.log(`Found ${parts.size} participants.`);
        parts.forEach(p => console.log(p.id, p.data()));
    }
}
check().catch(console.error);
