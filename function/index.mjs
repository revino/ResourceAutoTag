import { ResourceExplorer2Client, SearchCommand } from "@aws-sdk/client-resource-explorer-2";
import { CloudTrailClient, LookupEventsCommand } from "@aws-sdk/client-cloudtrail";
import { ResourceGroupsTaggingAPIClient, TagResourcesCommand, GetResourcesCommand } from "@aws-sdk/client-resource-groups-tagging-api";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import {alarmSlackMessageFromEvent, sendSlackNotification} from "./slack.mjs"


const re2Client = new ResourceExplorer2Client();
const ctClient = new CloudTrailClient();
const rgtaClient = new ResourceGroupsTaggingAPIClient();

const s3Client = new S3Client();

const TAG_KEY = 'blog';
const TAG_VALUE = 'ResourceAutoTagEnhanced';

async function arnFinder(jsonObject, searchedArn, searchedId) {
    if (Array.isArray(jsonObject)) {
        for(var i in jsonObject) {
            if (await arnFinder(jsonObject[i], searchedArn,searchedId)) return true;
        }
    } else {
        for(var i in jsonObject) {
            if (jsonObject[i] !== null && typeof (jsonObject[i]) === 'object') {
                if (await arnFinder(jsonObject[i], searchedArn,searchedId)) { return true; }
            } else {
                if (jsonObject[i] == searchedArn || jsonObject[i] == searchedId) return true;
            }
        }
    }
    return false;
}

/**
 * Resource Explorer에서 Resource 찾기
 */
async function getResourceExplorer2List(resourceType, isGlobal, maxCount) {

    var region = isGlobal ? 'global': process.env.AWS_REGION;
    var params = {
        QueryString: `resourcetype:${resourceType} -tag.${TAG_KEY}=${TAG_VALUE} region:${region}`,
        MaxResults: maxCount
    };

    try {
        const command = new SearchCommand(params);
        var res = await re2Client.send(command);

        return res;
    } catch (error) {
        console.error('error in getResourceExplorer2List ', error)
        return null;
    }
}

/**
 * Cloud Trail에서 Event 찾기
 */
async function getCloudTrailRecord(eventName, eventSource, duration, maxCount) {

    var endDate = new Date();
    var startDate = new Date(endDate);
    var minDuration = duration;
    startDate.setMinutes(endDate.getMinutes() - minDuration);


    var params = {
        LookupAttributes: [
            {
                AttributeKey: "EventName",
                AttributeValue: eventName
            },
            {
                AttributeKey: "EventSource",
                AttributeValue: eventSource
            }],
        MaxResults: maxCount,
        StartTime: startDate,
        EndTime: endDate
    };
    try {
        var command = new LookupEventsCommand(params);
        var res = await ctClient.send(command);
        return res;
    } catch (error) {
        console.error('error in getCloudTrailRecord ', error)
        return null;
    }
}

async function processResourceARN(ArnString, CTEvents, TagList) {

    let ArnAltId = '';
    let idx = ArnString.lastIndexOf('/');
    let findEvents = undefined;

    if (idx > 0) {
        ArnAltId = ArnString.substring(idx+1, ArnString.length);
    } else {
        idx = ArnString.lastIndexOf(':');
        if (idx > 0) {
            ArnAltId = ArnString.substring(idx+1, ArnString.length);
        }
    }
    console.log("Searching Arn " + ArnString + " and " + ArnAltId);

    for (let idx=0; idx<CTEvents.length; idx++) {
        let foundIt =  await arnFinder(CTEvents[idx], ArnString, ArnAltId);
        if (!foundIt) {
            foundIt =  await arnFinder(JSON.parse(CTEvents[idx].CloudTrailEvent), ArnString, ArnAltId);
        }
        if (foundIt) {
            console.log("Arn " + ArnString + " is found in CloudTrail ");

            // 중복된 Tag 찾기
            const getResourceTagListOutput = await getTagResourceByARN(ArnString);
            const tagKeyList = TagList.map((tag) => tag.Key);

            for(let resource of getResourceTagListOutput.ResourceTagMappingList){
                const resourceTagKeyList = resource.Tags.map((tag) => tag.Key);
                const isAllTagMatched = tagKeyList.every( tagKey => resourceTagKeyList.includes(tagKey));
                if(!isAllTagMatched){
                    console.log("Arn " + ArnString + " Write Tags");
                    await tagResourceByARN(ArnString, TagList);
                    findEvents = CTEvents[idx];
                }
            }

            break;
        }
    }

    return findEvents;
}

async function getTagResourceByARN(ArnString) {
    const arnList = [ArnString];

    try {
        const params = {
            ResourceARNList : arnList
        };
        let command = new GetResourcesCommand(params);

        return rgtaClient.send(command);
    } catch (error) {
        console.error('error in getTagResourceByARN ', error)
        return null;
    }
}


async function tagResourceByARN(ArnString, tagList) {
    const arnList = [ArnString];
    for (let i=0; i<tagList.length; i++) {
        const params = {
            ResourceARNList : arnList,
            Tags: {
                [tagList[i].Key] : tagList[i].Value
            }
        };
        let command = new TagResourcesCommand(params);

        await rgtaClient.send(command);
    }
}

/**
 * S3에 있는 Json 설정파일 불러오기
 */
async function getJSONFromS3(keyName) {

    const command = new GetObjectCommand({
        Key: keyName,
        Bucket: process.env.bucketName
    });
    console.log(JSON.stringify(command))
    const response = await s3Client.send(command);
    try {
        const jsonString = await response.Body?.transformToString();
        const json = JSON.parse(jsonString ?? '')
        return json
    } catch (error) {
        console.error('error parsing json', error)
        return null
    }
}


export const handler = async (event, context) => {

    // 설정 파일 불러오기
    const jsonResourceMapping = await getJSONFromS3("mapping.json");
    const jsonConfig = await getJSONFromS3("config.json");
    const tagConfig = await getJSONFromS3("tag.json");

    if (jsonResourceMapping == null || jsonResourceMapping == '' ||
        jsonConfig == null || jsonConfig == '' ||
        tagConfig == null || tagConfig == ''
    ) {
        console.error('Error in reading mapping.json')
        const response = {
            statusCode: 500,
            body: JSON.stringify('Error in reading config file'),
        };
        return response;
    }

    const mappingResourceList = jsonResourceMapping.Mapping;

    // Mapping 파일에서 설정한 인지 하기로한 리소스 데이터 찾기
    for (const mappingResource of mappingResourceList) {

        // Resource Explorer에서 해당 Resource 찾기
        // ResourceExplorerMaxResultCount : 최대 검색 갯수 1000개
        const reResult = await getResourceExplorer2List(mappingResource.REResourceType, mappingResource.Global, jsonConfig.ResourceExplorerMaxResultCount);

        // 해당하는 Resource 없으면 넘어가기
        if (reResult === null || reResult.Resources.length <= 0) continue;

        // Cloud Trail 에서 해당 Resource의 Event 찾기
        // CloudTrailScanDurationMinutes : CloudTrail 최대 검색 시간, 14400분 (240시간)
        // CloudTrailMaxResultCount : 최대 검색 갯수 1000개
        const ctResult = await getCloudTrailRecord(mappingResource.CTEventName, mappingResource.CTEventSource, jsonConfig.CloudTrailScanDurationMinutes, jsonConfig.CloudTrailMaxResultCount);

        // Explorer에서 찾은 리소스와 CloudTrail 데이터 비교하기
        for (const reResource of reResult.Resources) {
            const ctEvent = await processResourceARN(reResource.Arn, ctResult.Events, tagConfig.tagList);

            if(ctEvent !== undefined){
                const payload = alarmSlackMessageFromEvent(jsonConfig.SlackChannel, jsonConfig.SlackEmoji, JSON.parse(ctEvent.CloudTrailEvent));
                await sendSlackNotification(payload, jsonConfig.SlackWebhookUrl);
            }

        }
    }

    const response = {
        statusCode: 200,
        body: JSON.stringify('Resource Auto Tagging done'),
    };
    return response;
};