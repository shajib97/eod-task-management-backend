import {
    getCurrentShiftKey,
    type ShiftKey,
} from "../lib/current-shift";
import { db } from "../lib/db";
import { getShiftReportData } from "../lib/shift-report-data";
import { queueShiftReport } from "../lib/queue-shift-report";
import { deliverShiftReports } from "../lib/deliver-shift-reports";

function getPreviousShiftKey(current: ShiftKey): ShiftKey {
    if (current.name === "evening") {
        return { date: current.date, name: "morning" };
    }

    if (current.name === "night") {
        return { date: current.date, name: "evening" };
    }

    const previousDate = new Date(`${current.date}T00:00:00Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);

    return {
        date: previousDate.toISOString().slice(0, 10),
        name: "night",
    };
}

async function main() {
    const shift = getPreviousShiftKey(getCurrentShiftKey());
    const tasks = await getShiftReportData(shift);

    console.log(`Preparing report: ${shift.date} ${shift.name}`);
    console.log(`Total tasks: ${tasks.length}`);

    const result = await queueShiftReport(shift, tasks);

    console.log(
        result.queued
            ? "Report snapshot queued."
            : "No new snapshot: reports are disabled or it already exists.",
    );

    if (process.argv.includes("--send")) {
        await deliverShiftReports();
    } else {
        console.log("Preparation only. No emails sent.");
    }
}

main()
    .catch((error) => {
        console.error(
            "Report job failed:",
            error instanceof Error ? error.message : "Unknown error",
        );
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.end();
    });