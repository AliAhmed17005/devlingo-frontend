/**
 * calendarSync.js
 * Utility for syncing DevLingo events, study sessions, and peer match challenges
 * to Google Calendar (desktop & phone) and generating downloadable .ics calendar files.
 */

/**
 * Format a Date object or date/time string to Google Calendar date format (YYYYMMDDTHHmmss)
 */
function toGCalDateTime(dateInput, defaultHour = 9, defaultMinute = 0) {
  let d;
  if (typeof dateInput === "string") {
    if (dateInput.includes("T")) {
      d = new Date(dateInput);
    } else {
      // YYYY-MM-DD
      const [year, month, day] = dateInput.split("-").map(Number);
      d = new Date(year, month - 1, day, defaultHour, defaultMinute, 0);
    }
  } else if (dateInput instanceof Date) {
    d = dateInput;
  } else {
    d = new Date();
  }

  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());

  return `${year}${month}${day}T${hours}${mins}${secs}`;
}

/**
 * Generate a Google Calendar direct event URL.
 * When opened on mobile (Android/iOS) or desktop browser, Google Calendar
 * will pre-fill the event and allow the user to save it with 1 click to their phone calendar.
 */
export function getGoogleCalendarUrl({
  title,
  startDate,
  endDate,
  durationHours = 1,
  details = "",
  location = "DevLingo Learning Platform (Online)"
}) {
  const startStr = toGCalDateTime(startDate, 9, 0);

  let endStr;
  if (endDate) {
    endStr = toGCalDateTime(endDate, 10, 0);
  } else {
    // Add durationHours to start
    const [year, month, day] = (typeof startDate === "string" ? startDate.split("T")[0].split("-") : [
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      new Date().getDate()
    ]).map(Number);
    const endD = new Date(year, month - 1, day, 9 + Math.floor(durationHours), Math.round((durationHours % 1) * 60), 0);
    endStr = toGCalDateTime(endD);
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title || "DevLingo Study Session",
    dates: `${startStr}/${endStr}`,
    details: details ? `${details}\n\nTrack your progress on DevLingo.` : "DevLingo Event",
    location: location
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Open the Google Calendar pre-filled event in a new browser tab/app.
 */
export function openGoogleCalendarEvent(eventData) {
  const url = getGoogleCalendarUrl(eventData);
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Download a universal .ics (iCalendar) file for Apple Calendar, Outlook, and offline calendar apps.
 */
export function downloadIcsFile({
  title,
  startDate,
  durationHours = 1,
  details = "",
  location = "DevLingo Learning Platform (Online)"
}) {
  const startStr = toGCalDateTime(startDate, 9, 0);
  const [year, month, day] = (typeof startDate === "string" ? startDate.split("T")[0].split("-") : [
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    new Date().getDate()
  ]).map(Number);
  const endD = new Date(year, month - 1, day, 9 + Math.floor(durationHours), Math.round((durationHours % 1) * 60), 0);
  const endStr = toGCalDateTime(endD);

  const cleanTitle = (title || "DevLingo Event").replace(/\n/g, " ");
  const cleanDetails = (details || "DevLingo Event").replace(/\n/g, "\\n");

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DevLingo//Learning Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@devlingo.app`,
    `DTSTAMP:${toGCalDateTime(new Date())}Z`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${cleanTitle}`,
    `DESCRIPTION:${cleanDetails}`,
    `LOCATION:${location}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:Reminder: ${cleanTitle}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${(title || "event").toLowerCase().replace(/[^a-z0-9]/g, "_")}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
