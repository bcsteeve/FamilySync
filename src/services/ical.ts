import ICAL from 'ical.js';
import { CalendarEvent } from '../types';
import { createRRule } from './recurrence';
import { v4 as uuidv4 } from 'uuid';

// --- HELPER: Date to iCal String (YYYYMMDDTHHmmSS) ---
const dateToIcalString = (dateStr: string, isAllDay: boolean): string => {
    const d = new Date(dateStr);
    
    // For All Day, we just need YYYYMMDD
    if (isAllDay) {
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${y}${m}${day}`;
    }

    // For specific time, we format Local Time but attach no timezone (Floating Time)
    // This ensures "9:00 AM" stays "9:00 AM" regardless of where it is opened.
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    return `${y}${m}${day}T${h}${min}${s}`;
};

// --- EXPORT LOGIC ---
export const generateICS = (events: CalendarEvent[]): string => {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//FamilySync//App//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
    ];

    events.forEach(e => {
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${e.icalUID || e.id}`); // Prefer external UID, fallback to DB ID
        lines.push(`DTSTAMP:${dateToIcalString(new Date().toISOString(), false)}Z`); // Created Now (UTC)
        
        // Date/Time Logic
        const dtStartVal = dateToIcalString(e.startTime, !!e.isAllDay);
        const dtStartParam = e.isAllDay ? ';VALUE=DATE' : '';
        lines.push(`DTSTART${dtStartParam}:${dtStartVal}`);

        if (e.endTime) {
            let endDate = new Date(e.endTime);
            
            // FIX: For All-Day events, if Start == End, add 1 day to End (Exclusive)
            if (e.isAllDay) {
                const startDate = new Date(e.startTime);
                if (startDate.toDateString() === endDate.toDateString()) {
                    endDate.setDate(endDate.getDate() + 1);
                }
            }

            const dtEndVal = dateToIcalString(endDate.toISOString(), !!e.isAllDay);
            const dtEndParam = e.isAllDay ? ';VALUE=DATE' : '';
            lines.push(`DTEND${dtEndParam}:${dtEndVal}`);
        }

        lines.push(`SUMMARY:${e.title}`);
        if (e.description) lines.push(`DESCRIPTION:${e.description.replace(/\n/g, '\\n')}`);
        
        // Recurrence
        if (e.rrule) {
            // FIX: rrule.js .toString() often outputs multiple lines:
            // DTSTART:2025...
            // RRULE:FREQ=...
            // We need to find the FREQ line and ignore the internal DTSTART (since we export our own)
            const parts = e.rrule.split(/\r?\n/);
            const rruleLine = parts.find(p => p.startsWith('RRULE:') || p.startsWith('FREQ='));
            
            if (rruleLine) {
                const ruleClean = rruleLine.replace(/^RRULE:/i, '');
                lines.push(`RRULE:${ruleClean}`);
            } else if (e.rrule.startsWith('FREQ=')) {
                // Fallback for simple strings
                lines.push(`RRULE:${e.rrule}`);
            }
        }

        lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
};

// --- IMPORT LOGIC ---
export const parseICS = async (fileText: string): Promise<Partial<CalendarEvent>[]> => {
    try {
        const jcalData = ICAL.parse(fileText);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');

        return vevents.map(vevent => {
            const event = new ICAL.Event(vevent);
            
            // 1. Title & Desc
            const title = event.summary || 'Untitled Event';
            const description = event.description || '';
            const uid = event.uid || uuidv4();

            // 2. Time Handling (Convert to Local JS Date)
            // .toJSDate() converts to browser local time automatically
            const start = event.startDate.toJSDate(); 
            const end = event.endDate ? event.endDate.toJSDate() : new Date(start.getTime() + 3600000);
            
            // 3. Recurrence (RRULE)
            let rruleStr: string | undefined = undefined;
            if (event.component.hasProperty('rrule')) {
                // Get the raw RRULE string
                // ICAL.js objects can be complex, extracting the raw value is safest for rrule.js
                const rruleProp = event.component.getFirstProperty('rrule');
                if (rruleProp) {
                    rruleStr = rruleProp.toICALString().replace(/^RRULE:/i, '');
                }
            }

            return {
                title,
                description,
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                isAllDay: event.startDate.isDate, // True if just Date (no Time)
                rrule: rruleStr,
                icalUID: uid,
                exdates: [] // Complex exdate logic skipped for MVP import
            };
        });
    } catch (e) {
        console.error("iCal Parse Error", e);
        throw new Error("Failed to parse calendar file.");
    }
};