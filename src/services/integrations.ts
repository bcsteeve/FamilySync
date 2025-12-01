
import { CalendarEvent } from "../types";

// --- Utility: Retry Logic ---
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, retries = 3, baseDelay = 1000): Promise<any> {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                // If 404, don't retry, it won't appear.
                if (response.status === 404) return null; 
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            return await response.json();
        } catch (e) {
            lastError = e;
            // console.warn(`Attempt ${i + 1} failed for ${url}. Retrying...`);
            if (i < retries - 1) {
                await wait(baseDelay * Math.pow(2, i)); // Exponential backoff: 1s, 2s, 4s
            }
        }
    }
    console.error(`Failed to fetch ${url} after ${retries} attempts.`, lastError);
    throw lastError;
}

// --- Moon Phase Logic ---
// Synodic Month (New Moon to New Moon)
const LUNAR_CYCLE = 29.53058867; 
const KNOWN_NEW_MOON = new Date(Date.UTC(2000, 0, 6, 18, 14, 0)).getTime(); // Jan 6 2000 18:14 UTC

export const getMoonPhase = (date: Date): { icon: string, label: string } | null => {
    // We want to check if a specific phase PEAK occurs within this calendar day (Local Time).
    const startOfDay = new Date(date); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(date); endOfDay.setHours(23,59,59,999);
    
    // Approximate number of cycles since reference
    const msPerDay = 86400000;
    const timeDiff = startOfDay.getTime() - KNOWN_NEW_MOON;
    const cyclesSince = Math.floor(timeDiff / (LUNAR_CYCLE * msPerDay));

    // Check upcoming phases for the next 2 cycles to be safe
    for(let i = 0; i <= 1; i++) {
        const cycleStart = KNOWN_NEW_MOON + ((cyclesSince + i) * LUNAR_CYCLE * msPerDay);
        
        // Phase offsets in ms
        const phases = [
            { name: 'moon.new_moon', offset: 0, icon: '🌑' },
            { name: 'moon.first_quarter', offset: 0.25, icon: '🌓' },
            { name: 'moon.full_moon', offset: 0.5, icon: '🌕' },
            { name: 'moon.last_quarter', offset: 0.75, icon: '🌗' }
        ];

        for (const p of phases) {
            const phaseTime = cycleStart + (p.offset * LUNAR_CYCLE * msPerDay);
            // Strictly check if this instant is within the day's bounds
            if (phaseTime >= startOfDay.getTime() && phaseTime <= endOfDay.getTime()) {
                return { icon: p.icon, label: p.name };
            }
        }
    }

    return null; 
};

// --- Weather API (Open-Meteo) ---
export interface WeatherData {
    date: string; // YYYY-MM-DD
    maxTemp: number;
    minTemp: number;
    weatherCode: number;
}

export const getWeatherDescriptionKey = (code: number): string => {
    // Returns translation key instead of hardcoded string
    return `weather.${code}`;
}

export const getWeatherIcon = (code: number) => {
    // WMO Weather interpretation codes
    if (code === 0) return '☀️'; // Clear
    if (code >= 1 && code <= 3) return '⛅'; // Partly cloudy
    if (code >= 45 && code <= 48) return '🌫️'; // Fog
    if (code >= 51 && code <= 67) return '🌧️'; // Rain
    if (code >= 71 && code <= 77) return '❄️'; // Snow
    if (code >= 80 && code <= 82) return '🌦️'; // Showers
    if (code >= 95) return '⚡'; // Thunderstorm
    return '🌡️';
};

export const fetchWeather = async (lat: number, lon: number): Promise<WeatherData[]> => {
    try {
        const data = await fetchWithRetry(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`
        );
        
        if (!data || !data.daily) return [];

        // Manually construct YYYY-MM-DD from the response to match Local Time,
        // avoiding new Date() UTC shifts.
        return data.daily.time.map((timeStr: string, index: number) => {
            return {
                date: timeStr, 
                maxTemp: data.daily.temperature_2m_max[index],
                minTemp: data.daily.temperature_2m_min[index],
                weatherCode: data.daily.weather_code[index]
            };
        });
    } catch (error) {
        console.error("Weather Fetch Error", error);
        return []; // Fail gracefully
    }
};

// --- Geocoding (Open-Meteo) ---

const PROVINCE_ABBREVIATIONS: { [key: string]: string } = {
    // Canada
    'AB': 'Alberta', 'BC': 'British Columbia', 'MB': 'Manitoba', 'NB': 'New Brunswick', 
    'NL': 'Newfoundland and Labrador', 'NS': 'Nova Scotia', 'NT': 'Northwest Territories', 
    'NU': 'Nunavut', 'ON': 'Ontario', 'PE': 'Prince Edward Island', 'QC': 'Quebec', 
    'SK': 'Saskatchewan', 'YT': 'Yukon',
    // US (Common ones)
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
    'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
    'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
};

export const searchCity = async (query: string) => {
    try {
        // Handle "City, State" logic manually
        let cleanQuery = query;
        let stateFilter = '';
        
        if (query.includes(',')) {
            const parts = query.split(',');
            cleanQuery = parts[0].trim();
            if (parts.length > 1) {
                let rawState = parts[1].trim().toUpperCase();
                // Expand abbreviation if exists
                if (PROVINCE_ABBREVIATIONS[rawState]) {
                    stateFilter = PROVINCE_ABBREVIATIONS[rawState].toLowerCase();
                } else {
                    stateFilter = rawState.toLowerCase();
                }
            }
        }

        const data = await fetchWithRetry(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanQuery)}&count=20&language=en&format=json`);
        
        if (data && data.results) {
            let results = data.results.map((r: any) => ({
                name: r.name,
                admin1: r.admin1,
                country: r.country,
                lat: r.latitude,
                lon: r.longitude
            }));

            // Client-side filtering for state/region if provided
            if (stateFilter) {
                results = results.filter((r: any) => {
                    const admin = (r.admin1 || '').toLowerCase();
                    const country = (r.country || '').toLowerCase();
                    return admin.includes(stateFilter) || country.includes(stateFilter);
                });
            }
            return results;
        }
        return [];
    } catch (error) {
        console.error("Geocoding Error", error);
        return [];
    }
}

// --- Holidays (Nager.Date) ---

export interface CountryInfo {
    key: string; // "US"
    value: string; // "United States"
}

export const fetchAvailableCountries = async (): Promise<CountryInfo[]> => {
    try {
        const data = await fetchWithRetry('https://date.nager.at/api/v3/AvailableCountries');
        if (!data) return [];
        return data.map((c: any) => ({ key: c.countryCode, value: c.name }));
    } catch (e) {
        console.error("Failed to fetch countries", e);
        return [];
    }
}

export const fetchHolidays = async (year: number, countryCode: string, subdivisionCode?: string): Promise<CalendarEvent[]> => {
    try {
        const data = await fetchWithRetry(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
        
        if (!data) return [];
        
        return data
            .filter((h: any) => {
                // Filter Logic
                if (h.global) return true;
                if (subdivisionCode && h.counties && Array.isArray(h.counties)) {
                    return h.counties.includes(subdivisionCode);
                }
                return false;
            })
            .map((h: any) => {
                // DATE PARSING FIX:
                // Raw date is YYYY-MM-DD. 
                // We split and construct via local components (Year, MonthIndex, Day).
                const [y, m, d] = h.date.split('-').map(Number);
                const localDate = new Date(y, m - 1, d); // Month is 0-indexed
                
                return {
                    id: `holiday-${h.date}-${h.name}`,
                    title: `🎉 ${h.localName || h.name}`, 
                    description: h.name,
                    startTime: localDate.toISOString(),
                    endTime: localDate.toISOString(),
                    isAllDay: true,
                    userIds: [] 
                };
            });
    } catch (e) {
        console.error("Holiday fetch error", e);
        return [];
    }
};

export const getUniqueSubdivisions = async (year: number, countryCode: string): Promise<string[]> => {
    try {
        const data = await fetchWithRetry(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
        if (!data) return [];

        const counties = new Set<string>();
        data.forEach((h: any) => {
            if (h.counties && Array.isArray(h.counties)) {
                h.counties.forEach((c: string) => counties.add(c));
            }
        });
        return Array.from(counties).sort();
    } catch (e) {
        return [];
    }
}
