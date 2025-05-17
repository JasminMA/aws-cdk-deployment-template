import * as logs from "aws-cdk-lib/aws-logs";

/**
 * Utility class for working with CloudWatch Logs
 */
export class LogUtils {
    /**
     * Maps a retention days value to the corresponding RetentionDays enum value
     * @param days Number of days to retain logs
     * @returns The RetentionDays enum value
     */
    public static mapRetentionDays(days: number): logs.RetentionDays {
        const retentionOptions: { [key: number]: logs.RetentionDays } = {
            1: logs.RetentionDays.ONE_DAY,
            3: logs.RetentionDays.THREE_DAYS,
            5: logs.RetentionDays.FIVE_DAYS,
            7: logs.RetentionDays.ONE_WEEK,
            14: logs.RetentionDays.TWO_WEEKS,
            30: logs.RetentionDays.ONE_MONTH,
            60: logs.RetentionDays.TWO_MONTHS,
            90: logs.RetentionDays.THREE_MONTHS,
            120: logs.RetentionDays.FOUR_MONTHS,
            150: logs.RetentionDays.FIVE_MONTHS,
            180: logs.RetentionDays.SIX_MONTHS,
            365: logs.RetentionDays.ONE_YEAR,
            400: logs.RetentionDays.THIRTEEN_MONTHS,
            545: logs.RetentionDays.EIGHTEEN_MONTHS,
            731: logs.RetentionDays.TWO_YEARS,
            1827: logs.RetentionDays.FIVE_YEARS,
            3653: logs.RetentionDays.TEN_YEARS,
            // Default to infinite retention if the value doesn't match
            0: logs.RetentionDays.INFINITE,
        };

        // If the specific day count is found, return that
        if (retentionOptions[days]) {
            return retentionOptions[days];
        }

        // Otherwise, find the closest match that is larger than the requested days
        const sortedRetentionDays = Object.keys(retentionOptions)
            .map(k => parseInt(k))
            .filter(k => k > 0)  // Exclude INFINITE (0)
            .sort((a, b) => a - b);

        for (const retention of sortedRetentionDays) {
            if (retention >= days) {
                return retentionOptions[retention];
            }
        }

        // If we get here, the days value is larger than any available retention option
        return logs.RetentionDays.INFINITE;
    }
}