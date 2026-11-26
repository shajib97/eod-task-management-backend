export type ShiftKey = {
    date: string;
    name: "morning" | "evening" | "night";
};
const dhakaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

const dhakaHour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    hourCycle: "h23",
});

export function getCurrentShiftKey(): ShiftKey {
    const now = new Date();
    const hour = Number(dhakaHour.format(now));

    // Before 8 AM, the night shift started on the previous date.
    const shiftStartDay =
        hour < 8 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;

    const parts = dhakaDate.formatToParts(shiftStartDay);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    const date = `${year}-${month}-${day}`;

    if (hour >= 8 && hour < 15) return { date, name: "morning" };
    if (hour >= 15 && hour < 22) return { date, name: "evening" };

    return { date, name: "night" };
}

export function getNextShiftKey(shift: ShiftKey): ShiftKey {
    if (shift.name === "morning") {
        return { date: shift.date, name: "evening" };
    }

    if (shift.name === "evening") {
        return { date: shift.date, name: "night" };
    }

    const nextDate = new Date(`${shift.date}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

    return {
        date: nextDate.toISOString().slice(0, 10),
        name: "morning",
    };
}