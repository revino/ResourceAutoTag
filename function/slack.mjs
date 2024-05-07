import https from 'https';

export function alarmSlackMessageFromEvent(channel, emoji, ctEvent) {

    const utc0_time = new Date();

    const username = `${utc0_time.toISOString().slice(2, 16)}`;

    return {
        channel: channel,
        username,
        icon_emoji: emoji,
        text: "",
        attachments: [{
            color: "#dc143c",
            fields: [
                { title: "Event Source", value: ctEvent.eventSource, short: true },
                { title: "Event Region", value: ctEvent.awsRegion, short: true },
                { title: "Event Time", value: ctEvent.eventTime, short: true },
                { title: "Event Name", value: ctEvent.eventName, short: true },
                { title: "Account ID", value: ctEvent.recipientAccountId, short: true },
            ]
        }]
    };
}

export async function sendSlackNotification(payload, path) {
    const params = JSON.stringify(payload);

    const options = {
        hostname: 'hooks.slack.com',
        port: 443,
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            console.log(`Slack has responded with code ${res.statusCode}`);
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                resolve(responseData);
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(params);
        req.end();
    });
}

