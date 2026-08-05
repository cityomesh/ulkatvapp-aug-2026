// src/lib/epg.js
const EPG_ENDPOINT = "/apiv2/channels/epg";

export class EPGManager {
    constructor() {
        this.epgCache = {};
        this.isLoggedIn = true; // Set to true for now, adjust based on your auth
    }

    setLoginStatus(status) {
        this.isLoggedIn = status;
        // this.isLoggedIn = status;
    }

    parseDateString(dateString) {
        if (!dateString) return new Date(0);
        // Handle different date formats
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? new Date(0) : date;
    }

    async fetchEPG(channelNumbers) {
        if (!this.isLoggedIn) {
            console.log('User not logged in, skipping EPG fetch');
            return false;
        }

        if (!channelNumbers || channelNumbers.length === 0) {
            return false;
        }

        try {
            const response = await fetch(EPG_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                },
                body: JSON.stringify({ channel_numbers: channelNumbers })
            });

            const responseData = await response.json();

            if (responseData.status_code === 200 && responseData.response_object) {
                // Initialize cache for each channel
                channelNumbers.forEach(num => {
                    this.epgCache[num] = [];
                });

                // Populate cache with programs
                responseData.response_object.forEach(program => {
                    const chNum = program.number;
                    if (!this.epgCache[chNum]) {
                        this.epgCache[chNum] = [];
                    }
                    this.epgCache[chNum].push(program);
                });

                // Sort programs by start time for each channel
                for (let chNum in this.epgCache) {
                    this.epgCache[chNum].sort((a, b) => {
                        return this.parseDateString(a.programstart) - this.parseDateString(b.programstart);
                    });
                }

                return true;
            }
            return false;
        } catch (error) {
            console.error('EPG API call failed:', error);
            return false;
        }
    }

    getCurrentProgram(channelNumber) {
        const programs = this.epgCache[channelNumber];
        if (!programs || programs.length === 0) return null;

        const now = new Date();

        for (let program of programs) {
            const startTime = this.parseDateString(program.programstart);
            const endTime = this.parseDateString(program.programend);

            if (now >= startTime && now <= endTime) {
                return program;
            }
        }
        return null;
    }

    getUpcomingPrograms(channelNumber, limit = 2) {
        const programs = this.epgCache[channelNumber];
        if (!programs || programs.length === 0) return [];

        const now = new Date();
        const upcoming = [];

        for (let program of programs) {
            const startTime = this.parseDateString(program.programstart);
            if (startTime > now && upcoming.length < limit) {
                upcoming.push(program);
            }
        }
        return upcoming;
    }

    async loadEPGForChannel(channel) {
        if (!channel || !channel.channel_number) return null;

        const channelNumber = parseInt(channel.channel_number);

        // Check if already loaded and has data
        if (this.epgCache[channelNumber] && this.epgCache[channelNumber].length > 0) {
            return {
                current: this.getCurrentProgram(channelNumber),
                upcoming: this.getUpcomingPrograms(channelNumber, 2)
            };
        }

        // Fetch EPG data
        const success = await this.fetchEPG([channelNumber]);
        
        if (success) {
            return {
                current: this.getCurrentProgram(channelNumber),
                upcoming: this.getUpcomingPrograms(channelNumber, 2)
            };
        }
        
        return null;
    }

    clearCache() {
        this.epgCache = {};
    }
}

export const epgManager = new EPGManager();
