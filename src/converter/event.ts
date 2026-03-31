import type {
    OB11Event,
    OB11MessageSegment,
    MiraiEvent,
    MiraiGroup,
    MiraiMember,
    MiraiFriend,
    MiraiMessageChainElement,
} from '../types';
import { ob11ToMiraiChain } from './message';
import { pluginState } from '../core/state';

/**
 * Convert an OB11 event to a mirai event.
 * Returns null if the event cannot be converted.
 */
export function convertOB11Event(event: OB11Event): MiraiEvent | null {
    const postType = event.post_type;

    switch (postType) {
        case 'message':
        case 'message_sent':
            return convertMessageEvent(event);
        case 'notice':
            return convertNoticeEvent(event);
        case 'request':
            return convertRequestEvent(event);
        default:
            return null;
    }
}

function convertMessageEvent(event: OB11Event): MiraiEvent | null {
    const messageType = event.message_type;
    const segments = (Array.isArray(event.message) ? event.message : []) as OB11MessageSegment[];
    const messageChain = ob11ToMiraiChain(segments, event.message_id);
    const selfId = pluginState.selfId;

    // Enrich Quote elements with context from the event
    for (const elem of messageChain) {
        if (elem.type === 'Quote') {
            const q = elem as Record<string, unknown>;
            if (q.groupId === undefined) q.groupId = Number(event.group_id ?? 0);
            if (q.senderId === undefined) q.senderId = Number(event.user_id ?? 0);
            if (q.targetId === undefined) q.targetId = Number(event.self_id ?? selfId ?? 0);
            if (q.origin === undefined) q.origin = [{ type: 'Plain', text: '[消息]' }];
        }
    }

    // For message_sent, figure out if it's a sync message
    const isSent = event.post_type === 'message_sent';

    if (messageType === 'private') {
        const sender = event.sender || {};
        if (isSent) {
            // Sync message: sent by us to a friend
            return {
                type: 'FriendSyncMessage' as const,
                subject: {
                    id: Number(event.user_id ?? event.target_id ?? 0),
                    nickname: String(sender.nickname ?? ''),
                    remark: '',
                },
                messageChain,
            };
        }

        if (event.sub_type === 'group') {
            // Temp message (private msg from group member)
            return {
                type: 'TempMessage',
                sender: buildMember(event),
                messageChain,
            };
        }

        return {
            type: 'FriendMessage',
            sender: {
                id: Number(event.user_id ?? sender.user_id ?? 0),
                nickname: String(sender.nickname ?? ''),
                remark: String(sender.nickname ?? ''),
            },
            messageChain,
        };
    }

    if (messageType === 'group') {
        if (isSent) {
            return {
                type: 'GroupSyncMessage' as const,
                subject: {
                    id: Number(event.group_id ?? 0),
                    name: '',
                    permission: 'MEMBER',
                },
                messageChain,
            };
        }

        return {
            type: 'GroupMessage',
            sender: buildMember(event),
            messageChain,
        };
    }

    return null;
}

function convertNoticeEvent(event: OB11Event): MiraiEvent | null {
    const noticeType = event.notice_type;
    const selfId = pluginState.selfId;

    switch (noticeType) {
        case 'group_recall':
            return {
                type: 'GroupRecallEvent',
                authorId: Number(event.user_id ?? 0),
                messageId: Number(event.message_id ?? 0),
                time: Number(event.time ?? Math.floor(Date.now() / 1000)),
                group: buildGroup(event),
                operator: event.operator_id ? buildOperatorMember(event) : null,
            };

        case 'friend_recall':
            return {
                type: 'FriendRecallEvent',
                authorId: Number(event.user_id ?? 0),
                messageId: Number(event.message_id ?? 0),
                time: Number(event.time ?? Math.floor(Date.now() / 1000)),
                operator: Number(event.user_id ?? 0),
            };

        case 'group_increase': {
            const userId = Number(event.user_id ?? 0);
            if (userId === selfId) {
                return {
                    type: 'BotJoinGroupEvent',
                    group: buildGroup(event),
                    invitor: event.operator_id ? buildOperatorMember(event) : null,
                };
            }
            return {
                type: 'MemberJoinEvent',
                member: buildTargetMember(event),
                invitor: event.operator_id ? buildOperatorMember(event) : null,
            };
        }

        case 'group_decrease': {
            const userId = Number(event.user_id ?? 0);
            const subType = event.sub_type;
            if (userId === selfId) {
                if (subType === 'kick' || subType === 'kick_me') {
                    return {
                        type: 'BotLeaveEventKick',
                        group: buildGroup(event),
                        operator: event.operator_id ? buildOperatorMember(event) : null,
                    };
                }
                return {
                    type: 'BotLeaveEventActive',
                    group: buildGroup(event),
                };
            }
            if (subType === 'kick') {
                return {
                    type: 'MemberLeaveEventKick',
                    member: buildTargetMember(event),
                    operator: event.operator_id ? buildOperatorMember(event) : null,
                };
            }
            return {
                type: 'MemberLeaveEventQuit',
                member: buildTargetMember(event),
            };
        }

        case 'group_ban': {
            const userId = Number(event.user_id ?? 0);
            const duration = Number(event.duration ?? 0);
            if (userId === selfId) {
                if (duration > 0) {
                    return {
                        type: 'BotMuteEvent',
                        durationSeconds: duration,
                        operator: buildOperatorMember(event),
                    };
                }
                return {
                    type: 'BotUnmuteEvent',
                    operator: buildOperatorMember(event),
                };
            }
            if (event.sub_type === 'ban' && duration > 0) {
                return {
                    type: 'MemberMuteEvent',
                    durationSeconds: duration,
                    member: buildTargetMember(event),
                    operator: event.operator_id ? buildOperatorMember(event) : null,
                };
            }
            return {
                type: 'MemberUnmuteEvent',
                member: buildTargetMember(event),
                operator: event.operator_id ? buildOperatorMember(event) : null,
            };
        }

        case 'group_admin': {
            const userId = Number(event.user_id ?? 0);
            const subType = event.sub_type;
            if (userId === selfId) {
                return {
                    type: 'BotGroupPermissionChangeEvent',
                    origin: subType === 'set' ? 'MEMBER' : 'ADMINISTRATOR',
                    current: subType === 'set' ? 'ADMINISTRATOR' : 'MEMBER',
                    group: buildGroup(event),
                };
            }
            return {
                type: 'MemberPermissionChangeEvent',
                origin: subType === 'set' ? 'MEMBER' : 'ADMINISTRATOR',
                current: subType === 'set' ? 'ADMINISTRATOR' : 'MEMBER',
                member: buildTargetMember(event),
            };
        }

        case 'notify': {
            const subType = event.sub_type;
            if (subType === 'poke') {
                const isGroup = !!event.group_id;
                return {
                    type: 'NudgeEvent',
                    fromId: Number(event.user_id ?? event.operator_id ?? 0),
                    subject: {
                        id: isGroup ? Number(event.group_id) : Number(event.user_id ?? 0),
                        kind: isGroup ? 'Group' : 'Friend',
                    },
                    action: '戳了戳',
                    suffix: '',
                    target: Number(event.target_id ?? 0),
                };
            }
            if (subType === 'honor') {
                return {
                    type: 'MemberHonorChangeEvent',
                    member: buildTargetMember(event),
                    action: 'achieve',
                    honor: String(event.honor_type ?? ''),
                };
            }
            return null;
        }

        case 'group_card': {
            return {
                type: 'MemberCardChangeEvent',
                origin: String((event as Record<string, unknown>).card_old ?? ''),
                current: String((event as Record<string, unknown>).card_new ?? ''),
                member: buildTargetMember(event),
            };
        }

        case 'group_upload': {
            // No direct mirai equivalent for file upload notification;
            // return null as mirai handles files differently
            return null;
        }

        case 'friend_add': {
            return {
                type: 'FriendAddEvent',
                friend: {
                    id: Number(event.user_id ?? 0),
                    nickname: '',
                    remark: '',
                },
                stranger: false,
            };
        }

        case 'essence': {
            // No direct mirai equivalent
            return null;
        }

        default:
            return null;
    }
}

function convertRequestEvent(event: OB11Event): MiraiEvent | null {
    const requestType = event.request_type;

    switch (requestType) {
        case 'friend':
            return {
                type: 'NewFriendRequestEvent',
                eventId: flagToEventId(event.flag),
                fromId: Number(event.user_id ?? 0),
                groupId: Number(event.group_id ?? 0),
                nick: String(event.comment ?? ''),
                message: String(event.comment ?? ''),
            };

        case 'group': {
            const subType = event.sub_type;
            if (subType === 'invite') {
                return {
                    type: 'BotInvitedJoinGroupRequestEvent',
                    eventId: flagToEventId(event.flag),
                    fromId: Number(event.user_id ?? 0),
                    groupId: Number(event.group_id ?? 0),
                    groupName: '',
                    nick: '',
                    message: String(event.comment ?? ''),
                };
            }
            return {
                type: 'MemberJoinRequestEvent',
                eventId: flagToEventId(event.flag),
                fromId: Number(event.user_id ?? 0),
                groupId: Number(event.group_id ?? 0),
                groupName: '',
                nick: '',
                message: String(event.comment ?? ''),
                invitorId: null,
            };
        }

        default:
            return null;
    }
}

// ==================== Helpers ====================

// Store flag->eventId mapping for request events
const flagEventIdMap = new Map<string, number>();
let nextEventId = 1;

function flagToEventId(flag: string | undefined): number {
    if (!flag) return nextEventId++;
    let id = flagEventIdMap.get(flag);
    if (!id) {
        id = nextEventId++;
        flagEventIdMap.set(flag, id);
    }
    return id;
}

export function eventIdToFlag(eventId: number): string | undefined {
    for (const [flag, id] of flagEventIdMap) {
        if (id === eventId) return flag;
    }
    return undefined;
}

function buildGroup(event: OB11Event): MiraiGroup {
    return {
        id: Number(event.group_id ?? 0),
        name: '',
        permission: 'MEMBER',
    };
}

function buildMember(event: OB11Event): MiraiMember {
    const sender = event.sender || {};
    const role = String(sender.role ?? 'member');
    return {
        id: Number(event.user_id ?? sender.user_id ?? 0),
        memberName: String(sender.card || sender.nickname || ''),
        specialTitle: '',
        permission: roleToPermission(role),
        joinTimestamp: 0,
        lastSpeakTimestamp: Number(event.time ?? 0),
        muteTimeRemaining: 0,
        group: {
            id: Number(event.group_id ?? 0),
            name: '',
            permission: 'MEMBER',
        },
    };
}

function buildTargetMember(event: OB11Event): MiraiMember {
    return {
        id: Number(event.user_id ?? 0),
        memberName: '',
        specialTitle: '',
        permission: 'MEMBER',
        joinTimestamp: 0,
        lastSpeakTimestamp: 0,
        muteTimeRemaining: 0,
        group: buildGroup(event),
    };
}

function buildOperatorMember(event: OB11Event): MiraiMember {
    return {
        id: Number(event.operator_id ?? 0),
        memberName: '',
        specialTitle: '',
        permission: 'ADMINISTRATOR',
        joinTimestamp: 0,
        lastSpeakTimestamp: 0,
        muteTimeRemaining: 0,
        group: buildGroup(event),
    };
}

function roleToPermission(role: string): 'OWNER' | 'ADMINISTRATOR' | 'MEMBER' {
    switch (role) {
        case 'owner': return 'OWNER';
        case 'admin': return 'ADMINISTRATOR';
        default: return 'MEMBER';
    }
}
