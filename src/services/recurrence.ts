import { RRule } from 'rrule';
import { CalendarEvent, RecurrenceFreq } from '../types';

// 1. Convert UI State -> RRULE String (For Saving)
export const createRRule = (freq: RecurrenceFreq, dtstart: Date, until?: Date): string => {
    const options: any = {
        freq: RRule[freq],
        dtstart: dtstart, // Needed for accurate calculation
    };

    if (until) {
        options.until = until;
    }

    const rule = new RRule(options);
    return rule.toString();
};

// 2. Convert RRULE String -> UI State (For Editing)
export const parseRRule = (rruleStr: string): { freq: RecurrenceFreq, until?: string } | null => {
    try {
        if (!rruleStr) return null;
        
        const rule = RRule.fromString(rruleStr);
        const options = rule.options;

        // Map RRule freq number back to our String (0=YEARLY, 1=MONTHLY, 2=WEEKLY, 3=DAILY)
        // RRule constants: YEARLY=0, MONTHLY=1, WEEKLY=2, DAILY=3
        let freq: RecurrenceFreq = 'WEEKLY';
        switch (options.freq) {
            case RRule.YEARLY: freq = 'YEARLY'; break;
            case RRule.MONTHLY: freq = 'MONTHLY'; break;
            case RRule.WEEKLY: freq = 'WEEKLY'; break;
            case RRule.DAILY: freq = 'DAILY'; break;
            default: return null; // Complex/Unsupported rule (Hourly, etc)
        }

        return {
            freq,
            until: options.until ? options.until.toISOString() : undefined
        };
    } catch (e) {
        console.error("Failed to parse RRULE", e);
        return null;
    }
};

// 3. Expand Occurrences (For Calendar View)
export const expandRRule = (event: CalendarEvent, rangeStart: Date, rangeEnd: Date): CalendarEvent[] => {
    if (!event.rrule) return [event];

    try {
        // Parse the rule
        const options = RRule.parseString(event.rrule);
        
        // CRITICAL: RRule ignores the time of dtstart if not explicitly set in the rule,
        // but we need it to respect the event's start time.
        options.dtstart = new Date(event.startTime);

        const rule = new RRule(options);
        
        // Get all dates in range
        const dates = rule.between(rangeStart, rangeEnd, true); // true = inclusive

        // Map to Event Instances
        return dates.map(date => {
            const dateStr = date.toISOString();
            
            // Check Exceptions (Exdates)
            // We compare YYYY-MM-DD local strings
            const y = date.getFullYear();
            const m = (date.getMonth() + 1).toString().padStart(2, '0');
            const d = date.getDate().toString().padStart(2, '0');
            const localDateStr = `${y}-${m}-${d}`;

            if (event.exdates?.includes(localDateStr)) return null;

            // Calculate End Time (Duration)
            const duration = event.endTime 
                ? new Date(event.endTime).getTime() - new Date(event.startTime).getTime() 
                : 3600000; // Default 1 hour

            return {
                ...event,
                id: `${event.id}_${date.getTime()}`, // Virtual ID
                startTime: dateStr,
                endTime: new Date(date.getTime() + duration).toISOString(),
                // Strip the rule from instances so they don't re-expand recursively
                rrule: undefined 
            };
        }).filter(e => e !== null) as CalendarEvent[];

    } catch (e) {
        console.error("RRule Expansion Error", e);
        return [event]; // Fallback to showing just the single event
    }
};