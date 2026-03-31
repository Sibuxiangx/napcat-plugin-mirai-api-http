import { pluginState } from '../core/state';
import { sessionManager } from '../core/session';
import { messageCache } from '../core/cache';
import { miraiChainToOB11 } from '../converter/message';
import { ob11ToMiraiChain } from '../converter/message';
import { eventIdToFlag } from '../converter/event';
import type {
    MiraiResponse,
    MiraiMessageChainElement,
    OB11MessageSegment,
    MiraiGroup,
    MiraiMember,
    MiraiFriend,
    MiraiProfile,
} from '../types';
import { MiraiStatusCode } from '../types';

type Params = Record<string, unknown>;

function success(data?: unknown): MiraiResponse {
    return { code: MiraiStatusCode.Success, msg: 'success', data };
}

function error(code: number, msg: string): MiraiResponse {
    return { code, msg };
}

async function callAction(action: string, params: unknown = {}): Promise<unknown> {
    try {
        return await pluginState.callAction(action, params);
    } catch (e: unknown) {
        // Some OB11 actions (delete_msg, poke, etc.) succeed but return no data.
        // NapCat wraps that as "No data returned" error – treat as success.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('No data returned')) {
            return null;
        }
        throw e;
    }
}

// ==================== Session Endpoints ====================

export function handleVerify(params: Params): MiraiResponse {
    const verifyKey = String(params.verifyKey ?? '');
    const result = sessionManager.verify(verifyKey, pluginState.config.verifyKey);
    return { code: result.code, msg: result.msg ?? 'success', data: result.session ? { session: result.session } : undefined };
}

export function handleBind(params: Params): MiraiResponse {
    const sessionKey = String(params.sessionKey ?? '');
    const qq = Number(params.qq ?? 0);
    const result = sessionManager.bind(sessionKey, qq);
    return { code: result.code, msg: result.msg };
}

export function handleRelease(params: Params): MiraiResponse {
    const sessionKey = String(params.sessionKey ?? '');
    const qq = Number(params.qq ?? 0);
    const result = sessionManager.release(sessionKey, qq);
    return { code: result.code, msg: result.msg };
}

export async function handleSessionInfo(params: Params): Promise<MiraiResponse> {
    const sessionKey = String(params.sessionKey ?? '');
    const session = sessionManager.getSession(sessionKey);
    if (!session || session.qq === null) {
        return error(MiraiStatusCode.NotAuthenticated, 'Session not authenticated');
    }
    try {
        const info = await callAction('get_login_info') as { user_id?: number; nickname?: string };
        return success({
            sessionKey,
            qq: {
                id: session.qq,
                nickname: info?.nickname ?? '',
                remark: '',
            },
        });
    } catch {
        return success({ sessionKey, qq: { id: session.qq, nickname: '', remark: '' } });
    }
}

// ==================== Info Endpoints ====================

export async function handleAbout(): Promise<MiraiResponse> {
    return success({
        version: 'v2.9.1(napcat-mirai-api-http)',
    });
}

export async function handleBotList(): Promise<MiraiResponse> {
    try {
        const info = await callAction('get_login_info') as { user_id?: number };
        return success([info?.user_id ?? pluginState.selfId]);
    } catch {
        return success([pluginState.selfId]);
    }
}

// ==================== Message Endpoints ====================

export async function handleSendFriendMessage(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? params.qq ?? 0);
    const messageChain = (params.messageChain ?? []) as MiraiMessageChainElement[];
    const quote = params.quote ? Number(params.quote) : undefined;

    const ob11Segments = miraiChainToOB11(messageChain);
    const sendParams: Record<string, unknown> = {
        message_type: 'private',
        user_id: String(target),
        message: ob11Segments,
    };

    if (quote) {
        (sendParams.message as OB11MessageSegment[]).unshift({
            type: 'reply',
            data: { id: String(quote) },
        });
    }

    try {
        const result = await callAction('send_msg', sendParams) as { message_id?: number };
        return success({ messageId: result?.message_id ?? 0 });
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleSendGroupMessage(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? params.group ?? 0);
    const messageChain = (params.messageChain ?? []) as MiraiMessageChainElement[];
    const quote = params.quote ? Number(params.quote) : undefined;

    const ob11Segments = miraiChainToOB11(messageChain);
    const sendParams: Record<string, unknown> = {
        message_type: 'group',
        group_id: String(target),
        message: ob11Segments,
    };

    if (quote) {
        (sendParams.message as OB11MessageSegment[]).unshift({
            type: 'reply',
            data: { id: String(quote) },
        });
    }

    try {
        const result = await callAction('send_msg', sendParams) as { message_id?: number };
        return success({ messageId: result?.message_id ?? 0 });
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleSendTempMessage(params: Params): Promise<MiraiResponse> {
    const qq = Number(params.qq ?? 0);
    const group = Number(params.group ?? 0);
    const messageChain = (params.messageChain ?? []) as MiraiMessageChainElement[];
    const quote = params.quote ? Number(params.quote) : undefined;

    const ob11Segments = miraiChainToOB11(messageChain);
    const sendParams: Record<string, unknown> = {
        message_type: 'private',
        user_id: String(qq),
        group_id: String(group),
        message: ob11Segments,
    };

    if (quote) {
        (sendParams.message as OB11MessageSegment[]).unshift({
            type: 'reply',
            data: { id: String(quote) },
        });
    }

    try {
        const result = await callAction('send_msg', sendParams) as { message_id?: number };
        return success({ messageId: result?.message_id ?? 0 });
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleRecall(params: Params): Promise<MiraiResponse> {
    const messageId = Number(params.messageId ?? params.target ?? 0);
    try {
        await callAction('delete_msg', { message_id: messageId });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleSendNudge(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    const subject = Number(params.subject ?? 0);
    const kind = String(params.kind ?? 'Group');

    try {
        if (kind === 'Group') {
            await callAction('group_poke', { group_id: subject, user_id: target });
        } else {
            await callAction('friend_poke', { user_id: target });
        }
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleMessageFromId(params: Params): Promise<MiraiResponse> {
    const messageId = Number(params.messageId ?? params.id ?? 0);
    const target = Number(params.target ?? 0);

    // First check local cache
    const cached = messageCache.get(messageId);
    if (cached) {
        return success({
            type: cached.type,
            messageChain: cached.messageChain,
            sender: cached.sender,
        });
    }

    // Try to get from OB11
    try {
        const result = await callAction('get_msg', { message_id: messageId }) as Record<string, unknown>;
        if (result) {
            const segments = (result.message ?? []) as OB11MessageSegment[];
            const chain = ob11ToMiraiChain(segments, messageId);
            const messageType = result.message_type === 'group' ? 'GroupMessage' : 'FriendMessage';
            const sender = result.sender as Record<string, unknown> | undefined;
            return success({
                type: messageType,
                messageChain: chain,
                sender: sender ? {
                    id: Number(sender.user_id ?? 0),
                    nickname: String(sender.nickname ?? ''),
                    memberName: String(sender.card ?? sender.nickname ?? ''),
                } : { id: 0, nickname: '' },
            });
        }
    } catch {
        // ignore
    }

    return error(MiraiStatusCode.TargetNotExist, 'Message not found');
}

// ==================== Queue Endpoints ====================

export function handleCountMessage(params: Params): MiraiResponse {
    const sessionKey = String(params.sessionKey ?? '');
    return success(sessionManager.countMessages(sessionKey));
}

export function handleFetchMessage(params: Params): MiraiResponse {
    const sessionKey = String(params.sessionKey ?? '');
    const count = Number(params.count ?? 10);
    return success(sessionManager.fetchMessages(sessionKey, count));
}

export function handleFetchLatestMessage(params: Params): MiraiResponse {
    const sessionKey = String(params.sessionKey ?? '');
    const count = Number(params.count ?? 10);
    return success(sessionManager.fetchLatestMessages(sessionKey, count));
}

export function handlePeekMessage(params: Params): MiraiResponse {
    const sessionKey = String(params.sessionKey ?? '');
    const count = Number(params.count ?? 10);
    return success(sessionManager.peekMessages(sessionKey, count));
}

export function handlePeekLatestMessage(params: Params): MiraiResponse {
    const sessionKey = String(params.sessionKey ?? '');
    const count = Number(params.count ?? 10);
    return success(sessionManager.peekLatestMessages(sessionKey, count));
}

// ==================== Contact Endpoints ====================

export async function handleFriendList(): Promise<MiraiResponse> {
    try {
        const result = await callAction('get_friend_list') as Array<Record<string, unknown>>;
        const friends: MiraiFriend[] = (result ?? []).map((f) => ({
            id: Number(f.user_id ?? 0),
            nickname: String(f.nickname ?? ''),
            remark: String(f.remark ?? f.nickname ?? ''),
        }));
        return success(friends);
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleGroupList(): Promise<MiraiResponse> {
    try {
        const result = await callAction('get_group_list') as Array<Record<string, unknown>>;
        const groups: MiraiGroup[] = (result ?? []).map((g) => ({
            id: Number(g.group_id ?? 0),
            name: String(g.group_name ?? ''),
            permission: 'MEMBER' as const,
        }));
        return success(groups);
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleMemberList(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    try {
        const result = await callAction('get_group_member_list', { group_id: target }) as Array<Record<string, unknown>>;
        const members: MiraiMember[] = (result ?? []).map((m) => ({
            id: Number(m.user_id ?? 0),
            memberName: String(m.card || m.nickname || ''),
            specialTitle: String(m.title ?? ''),
            permission: roleToPermission(String(m.role ?? 'member')),
            joinTimestamp: Number(m.join_time ?? 0),
            lastSpeakTimestamp: Number(m.last_sent_time ?? 0),
            muteTimeRemaining: Number(m.shut_up_timestamp ?? 0),
            group: {
                id: target,
                name: '',
                permission: 'MEMBER' as const,
            },
        }));
        return success(members);
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleBotProfile(): Promise<MiraiResponse> {
    try {
        const info = await callAction('get_login_info') as Record<string, unknown>;
        return success({
            nickname: String(info?.nickname ?? ''),
            email: '',
            age: 0,
            level: 0,
            sign: '',
            sex: 'UNKNOWN',
        } as MiraiProfile);
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleFriendProfile(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    try {
        const info = await callAction('get_stranger_info', { user_id: target }) as Record<string, unknown>;
        return success({
            nickname: String(info?.nickname ?? ''),
            email: '',
            age: Number(info?.age ?? 0),
            level: Number(info?.level ?? 0),
            sign: String(info?.sign ?? ''),
            sex: mapSex(String(info?.sex ?? 'unknown')),
        } as MiraiProfile);
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleMemberProfile(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    const memberId = Number(params.memberId ?? 0);
    try {
        const info = await callAction('get_group_member_info', {
            group_id: target,
            user_id: memberId,
        }) as Record<string, unknown>;
        return success({
            nickname: String(info?.nickname ?? ''),
            email: '',
            age: Number(info?.age ?? 0),
            level: Number(info?.level ?? 0),
            sign: String(info?.sign ?? ''),
            sex: mapSex(String(info?.sex ?? 'unknown')),
        } as MiraiProfile);
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleUserProfile(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    try {
        const info = await callAction('get_stranger_info', { user_id: target }) as Record<string, unknown>;
        return success({
            nickname: String(info?.nickname ?? ''),
            email: '',
            age: Number(info?.age ?? 0),
            level: Number(info?.level ?? 0),
            sign: String(info?.sign ?? ''),
            sex: mapSex(String(info?.sex ?? 'unknown')),
        } as MiraiProfile);
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

// ==================== Group Management ====================

export async function handleMute(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    const memberId = Number(params.memberId ?? 0);
    const time = Number(params.time ?? 600);
    try {
        await callAction('set_group_ban', {
            group_id: target,
            user_id: memberId,
            duration: time,
        });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleUnmute(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    const memberId = Number(params.memberId ?? 0);
    try {
        await callAction('set_group_ban', {
            group_id: target,
            user_id: memberId,
            duration: 0,
        });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleKick(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    const memberId = Number(params.memberId ?? 0);
    const block = Boolean(params.block ?? false);
    try {
        await callAction('set_group_kick', {
            group_id: target,
            user_id: memberId,
            reject_add_request: block,
        });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleQuit(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    try {
        await callAction('set_group_leave', { group_id: target });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleMuteAll(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    try {
        await callAction('set_group_whole_ban', { group_id: target, enable: true });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleUnmuteAll(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    try {
        await callAction('set_group_whole_ban', { group_id: target, enable: false });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleSetEssence(params: Params): Promise<MiraiResponse> {
    const messageId = Number(params.messageId ?? params.target ?? 0);
    try {
        await callAction('set_essence_msg', { message_id: messageId });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleGetGroupConfig(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    try {
        const info = await callAction('get_group_info', { group_id: target }) as Record<string, unknown>;
        return success({
            name: String(info?.group_name ?? ''),
            announcement: '',
            confessTalk: false,
            allowMemberInvite: false,
            autoApprove: false,
            anonymousChat: false,
            muteAll: false,
        });
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleSetGroupConfig(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    const config = (params.config ?? params) as Record<string, unknown>;
    try {
        if (config.name) {
            await callAction('set_group_name', {
                group_id: target,
                group_name: String(config.name),
            });
        }
        if (typeof config.muteAll === 'boolean') {
            await callAction('set_group_whole_ban', {
                group_id: target,
                enable: config.muteAll,
            });
        }
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleGetMemberInfo(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    const memberId = Number(params.memberId ?? 0);
    try {
        const info = await callAction('get_group_member_info', {
            group_id: target,
            user_id: memberId,
        }) as Record<string, unknown>;
        return success({
            id: Number(info?.user_id ?? memberId),
            memberName: String(info?.card || info?.nickname || ''),
            specialTitle: String(info?.title ?? ''),
            permission: roleToPermission(String(info?.role ?? 'member')),
            joinTimestamp: Number(info?.join_time ?? 0),
            lastSpeakTimestamp: Number(info?.last_sent_time ?? 0),
            muteTimeRemaining: Number(info?.shut_up_timestamp ?? 0),
            group: {
                id: target,
                name: '',
                permission: 'MEMBER' as const,
            },
        });
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleSetMemberInfo(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    const memberId = Number(params.memberId ?? 0);
    const info = (params.info ?? params) as Record<string, unknown>;
    try {
        if (info.name !== undefined) {
            await callAction('set_group_card', {
                group_id: target,
                user_id: memberId,
                card: String(info.name),
            });
        }
        if (info.specialTitle !== undefined) {
            await callAction('set_group_special_title', {
                group_id: target,
                user_id: memberId,
                special_title: String(info.specialTitle),
            });
        }
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleMemberAdmin(params: Params): Promise<MiraiResponse> {
    const target = Number(params.target ?? 0);
    const memberId = Number(params.memberId ?? 0);
    const assign = Boolean(params.assign ?? true);
    try {
        await callAction('set_group_admin', {
            group_id: target,
            user_id: memberId,
            enable: assign,
        });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

// ==================== Event Handling ====================

export async function handleRespNewFriendRequest(params: Params): Promise<MiraiResponse> {
    const eventId = Number(params.eventId ?? 0);
    const operate = Number(params.operate ?? 0);
    const message = String(params.message ?? '');
    const fromId = Number(params.fromId ?? 0);
    const groupId = Number(params.groupId ?? 0);

    const flag = eventIdToFlag(eventId);
    if (!flag) {
        return error(MiraiStatusCode.BadRequest, 'Event not found');
    }

    try {
        await callAction('set_friend_add_request', {
            flag,
            approve: operate === 0,
            remark: message,
        });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleRespMemberJoinRequest(params: Params): Promise<MiraiResponse> {
    const eventId = Number(params.eventId ?? 0);
    const operate = Number(params.operate ?? 0);
    const message = String(params.message ?? '');

    const flag = eventIdToFlag(eventId);
    if (!flag) {
        return error(MiraiStatusCode.BadRequest, 'Event not found');
    }

    // operate: 0=accept, 1=reject, 2=ignore, 3=reject+blacklist, 4=ignore+blacklist
    let approve = false;
    let reason = message;
    if (operate === 0) approve = true;

    try {
        await callAction('set_group_add_request', {
            flag,
            sub_type: 'add',
            approve,
            reason,
        });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

export async function handleRespBotInvitedJoinGroup(params: Params): Promise<MiraiResponse> {
    const eventId = Number(params.eventId ?? 0);
    const operate = Number(params.operate ?? 0);
    const message = String(params.message ?? '');

    const flag = eventIdToFlag(eventId);
    if (!flag) {
        return error(MiraiStatusCode.BadRequest, 'Event not found');
    }

    try {
        await callAction('set_group_add_request', {
            flag,
            sub_type: 'invite',
            approve: operate === 0,
            reason: message,
        });
        return success();
    } catch (e) {
        return error(MiraiStatusCode.BadRequest, String(e));
    }
}

// ==================== Unified Command Router ====================

export async function routeCommand(command: string, params: Params): Promise<MiraiResponse> {
    switch (command) {
        // Session
        case 'verify': return handleVerify(params);
        case 'bind': return handleBind(params);
        case 'release': return handleRelease(params);
        case 'sessionInfo': return await handleSessionInfo(params);

        // Info
        case 'about': return await handleAbout();
        case 'botList': return await handleBotList();

        // Messages
        case 'sendFriendMessage': return await handleSendFriendMessage(params);
        case 'sendGroupMessage': return await handleSendGroupMessage(params);
        case 'sendTempMessage': return await handleSendTempMessage(params);
        case 'recall': return await handleRecall(params);
        case 'sendNudge': return await handleSendNudge(params);
        case 'messageFromId': return await handleMessageFromId(params);

        // Queue
        case 'countMessage': return handleCountMessage(params);
        case 'fetchMessage': return handleFetchMessage(params);
        case 'fetchLatestMessage': return handleFetchLatestMessage(params);
        case 'peekMessage': return handlePeekMessage(params);
        case 'peekLatestMessage': return handlePeekLatestMessage(params);

        // Contacts
        case 'friendList': return await handleFriendList();
        case 'groupList': return await handleGroupList();
        case 'memberList': return await handleMemberList(params);
        case 'botProfile': return await handleBotProfile();
        case 'friendProfile': return await handleFriendProfile(params);
        case 'memberProfile': return await handleMemberProfile(params);
        case 'userProfile': return await handleUserProfile(params);

        // Group management
        case 'mute': return await handleMute(params);
        case 'unmute': return await handleUnmute(params);
        case 'kick': return await handleKick(params);
        case 'quit': return await handleQuit(params);
        case 'muteAll': return await handleMuteAll(params);
        case 'unmuteAll': return await handleUnmuteAll(params);
        case 'setEssence': return await handleSetEssence(params);
        case 'groupConfig': {
            if (params.config || params.name || params.muteAll !== undefined) {
                return await handleSetGroupConfig(params);
            }
            return await handleGetGroupConfig(params);
        }
        case 'memberInfo': {
            if (params.info || params.name !== undefined || params.specialTitle !== undefined) {
                return await handleSetMemberInfo(params);
            }
            return await handleGetMemberInfo(params);
        }
        case 'memberAdmin': return await handleMemberAdmin(params);

        // Event responses
        case 'resp_newFriendRequestEvent': return await handleRespNewFriendRequest(params);
        case 'resp_memberJoinRequestEvent': return await handleRespMemberJoinRequest(params);
        case 'resp_botInvitedJoinGroupRequestEvent': return await handleRespBotInvitedJoinGroup(params);

        default:
            return error(MiraiStatusCode.BadRequest, `Unknown command: ${command}`);
    }
}

// ==================== Helpers ====================

function roleToPermission(role: string): 'OWNER' | 'ADMINISTRATOR' | 'MEMBER' {
    switch (role) {
        case 'owner': return 'OWNER';
        case 'admin': return 'ADMINISTRATOR';
        default: return 'MEMBER';
    }
}

function mapSex(sex: string): 'UNKNOWN' | 'MALE' | 'FEMALE' {
    switch (sex) {
        case 'male': return 'MALE';
        case 'female': return 'FEMALE';
        default: return 'UNKNOWN';
    }
}
