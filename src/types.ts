// ==================== Plugin Config ====================

export interface ReverseWsDestination {
    url: string;
    reconnectInterval: number;
    extraHeaders: Record<string, string>;
}

export interface PluginConfig {
    enabled: boolean;
    port: number;
    verifyKey: string;
    debug: boolean;
    // Adapter toggles
    enableHttp: boolean;
    enableWs: boolean;
    enableReverseWs: boolean;
    enableWebhook: boolean;
    // Reverse WS settings
    reverseWs: {
        destinations: ReverseWsDestination[];
        reservedSyncId: string;
    };
    // Webhook settings
    webhook: {
        destinations: string[];
        extraHeaders: Record<string, string>;
        timeout: number;
    };
}

// ==================== Mirai Status Codes ====================

export const MiraiStatusCode = {
    Success: 0,
    InvalidVerifyKey: 1,
    BotNotExist: 2,
    InvalidSession: 3,
    NotAuthenticated: 4,
    TargetNotExist: 5,
    FileNotExist: 6,
    NoPermission: 10,
    BotMuted: 20,
    MessageTooLong: 30,
    BadRequest: 400,
} as const;

// ==================== Mirai API Response ====================

export interface MiraiResponse {
    code: number;
    msg: string;
    data?: unknown;
    messageId?: number;
}

// ==================== Mirai Contact Types ====================

export interface MiraiFriend {
    id: number;
    nickname: string;
    remark: string;
}

export interface MiraiGroup {
    id: number;
    name: string;
    permission: 'OWNER' | 'ADMINISTRATOR' | 'MEMBER';
}

export interface MiraiMember {
    id: number;
    memberName: string;
    specialTitle: string;
    permission: 'OWNER' | 'ADMINISTRATOR' | 'MEMBER';
    joinTimestamp: number;
    lastSpeakTimestamp: number;
    muteTimeRemaining: number;
    group: MiraiGroup;
}

export interface MiraiProfile {
    nickname: string;
    email: string;
    age: number;
    level: number;
    sign: string;
    sex: 'UNKNOWN' | 'MALE' | 'FEMALE';
}

// ==================== Mirai Message Chain Elements ====================

export interface MiraiSource {
    type: 'Source';
    id: number;
    time: number;
}

export interface MiraiPlain {
    type: 'Plain';
    text: string;
}

export interface MiraiAt {
    type: 'At';
    target: number;
    display?: string;
}

export interface MiraiAtAll {
    type: 'AtAll';
}

export interface MiraiImage {
    type: 'Image';
    imageId?: string;
    url?: string;
    path?: string;
    base64?: string;
    width?: number;
    height?: number;
    size?: number;
    imageType?: string;
    isEmoji?: boolean;
}

export interface MiraiFlashImage {
    type: 'FlashImage';
    imageId?: string;
    url?: string;
    path?: string;
    base64?: string;
    width?: number;
    height?: number;
    size?: number;
    imageType?: string;
    isEmoji?: boolean;
}

export interface MiraiFace {
    type: 'Face';
    faceId?: number;
    name?: string;
    isSuperFace?: boolean;
}

export interface MiraiQuote {
    type: 'Quote';
    id: number;
    groupId?: number;
    senderId?: number;
    targetId?: number;
    origin?: MiraiMessageChainElement[];
}

export interface MiraiVoice {
    type: 'Voice';
    voiceId?: string;
    url?: string;
    path?: string;
    base64?: string;
    length?: number;
}

export interface MiraiXml {
    type: 'Xml';
    xml: string;
}

export interface MiraiJson {
    type: 'Json';
    json: string;
}

export interface MiraiApp {
    type: 'App';
    content: string;
}

export interface MiraiPoke {
    type: 'Poke';
    name: string;
}

export interface MiraiDice {
    type: 'Dice';
    value: number;
}

export interface MiraiMusicShare {
    type: 'MusicShare';
    kind: string;
    title: string;
    summary: string;
    jumpUrl: string;
    pictureUrl: string;
    musicUrl: string;
    brief: string;
}

export interface MiraiForwardNode {
    senderId?: number;
    time?: number;
    senderName?: string;
    messageChain?: MiraiMessageChainElement[];
    messageId?: number;
    messageRef?: { messageId: number; target: number };
}

export interface MiraiForward {
    type: 'Forward';
    display?: {
        title?: string;
        brief?: string;
        source?: string;
        preview?: string[];
        summary?: string;
    };
    nodeList: MiraiForwardNode[];
}

export interface MiraiFile {
    type: 'File';
    id: string;
    name: string;
    size: number;
}

export interface MiraiMarketFace {
    type: 'MarketFace';
    id: number;
    name: string;
}

export interface MiraiMiraiCode {
    type: 'MiraiCode';
    code: string;
}

export interface MiraiShortVideo {
    type: 'ShortVideo';
    videoId?: string;
    fileMd5?: string;
    fileSize?: number;
    fileFormat?: string;
    filename?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
}

export type MiraiMessageChainElement =
    | MiraiSource
    | MiraiPlain
    | MiraiAt
    | MiraiAtAll
    | MiraiImage
    | MiraiFlashImage
    | MiraiFace
    | MiraiQuote
    | MiraiVoice
    | MiraiXml
    | MiraiJson
    | MiraiApp
    | MiraiPoke
    | MiraiDice
    | MiraiMusicShare
    | MiraiForward
    | MiraiFile
    | MiraiMarketFace
    | MiraiMiraiCode
    | MiraiShortVideo;

// ==================== Mirai Event Types ====================

export interface MiraiFriendMessage {
    type: 'FriendMessage';
    sender: MiraiFriend;
    messageChain: MiraiMessageChainElement[];
}

export interface MiraiGroupMessage {
    type: 'GroupMessage';
    sender: MiraiMember;
    messageChain: MiraiMessageChainElement[];
}

export interface MiraiTempMessage {
    type: 'TempMessage';
    sender: MiraiMember;
    messageChain: MiraiMessageChainElement[];
}

export interface MiraiStrangerMessage {
    type: 'StrangerMessage';
    sender: MiraiFriend;
    messageChain: MiraiMessageChainElement[];
}

export interface MiraiFriendSyncMessage {
    type: 'FriendSyncMessage';
    subject: MiraiFriend;
    messageChain: MiraiMessageChainElement[];
}

export interface MiraiGroupSyncMessage {
    type: 'GroupSyncMessage';
    subject: MiraiGroup;
    messageChain: MiraiMessageChainElement[];
}

// Event types
export interface MiraiBotOnlineEvent {
    type: 'BotOnlineEvent';
    qq: number;
}

export interface MiraiBotOfflineEventActive {
    type: 'BotOfflineEventActive';
    qq: number;
}

export interface MiraiBotOfflineEventForce {
    type: 'BotOfflineEventForce';
    qq: number;
}

export interface MiraiBotOfflineEventDropped {
    type: 'BotOfflineEventDropped';
    qq: number;
}

export interface MiraiBotReloginEvent {
    type: 'BotReloginEvent';
    qq: number;
}

export interface MiraiFriendRecallEvent {
    type: 'FriendRecallEvent';
    authorId: number;
    messageId: number;
    time: number;
    operator: number;
}

export interface MiraiGroupRecallEvent {
    type: 'GroupRecallEvent';
    authorId: number;
    messageId: number;
    time: number;
    group: MiraiGroup;
    operator: MiraiMember | null;
}

export interface MiraiNudgeEvent {
    type: 'NudgeEvent';
    fromId: number;
    subject: { id: number; kind: 'Friend' | 'Group' };
    action: string;
    suffix: string;
    target: number;
}

export interface MiraiBotGroupPermissionChangeEvent {
    type: 'BotGroupPermissionChangeEvent';
    origin: string;
    current: string;
    group: MiraiGroup;
}

export interface MiraiBotMuteEvent {
    type: 'BotMuteEvent';
    durationSeconds: number;
    operator: MiraiMember;
}

export interface MiraiBotUnmuteEvent {
    type: 'BotUnmuteEvent';
    operator: MiraiMember;
}

export interface MiraiBotJoinGroupEvent {
    type: 'BotJoinGroupEvent';
    group: MiraiGroup;
    invitor: MiraiMember | null;
}

export interface MiraiBotLeaveEventActive {
    type: 'BotLeaveEventActive';
    group: MiraiGroup;
}

export interface MiraiBotLeaveEventKick {
    type: 'BotLeaveEventKick';
    group: MiraiGroup;
    operator: MiraiMember | null;
}

export interface MiraiGroupMuteAllEvent {
    type: 'GroupMuteAllEvent';
    origin: boolean;
    current: boolean;
    group: MiraiGroup;
    operator: MiraiMember | null;
}

export interface MiraiGroupNameChangeEvent {
    type: 'GroupNameChangeEvent';
    origin: string;
    current: string;
    group: MiraiGroup;
    operator: MiraiMember | null;
}

export interface MiraiMemberJoinEvent {
    type: 'MemberJoinEvent';
    member: MiraiMember;
    invitor: MiraiMember | null;
}

export interface MiraiMemberLeaveEventKick {
    type: 'MemberLeaveEventKick';
    member: MiraiMember;
    operator: MiraiMember | null;
}

export interface MiraiMemberLeaveEventQuit {
    type: 'MemberLeaveEventQuit';
    member: MiraiMember;
}

export interface MiraiMemberCardChangeEvent {
    type: 'MemberCardChangeEvent';
    origin: string;
    current: string;
    member: MiraiMember;
}

export interface MiraiMemberPermissionChangeEvent {
    type: 'MemberPermissionChangeEvent';
    origin: string;
    current: string;
    member: MiraiMember;
}

export interface MiraiMemberMuteEvent {
    type: 'MemberMuteEvent';
    durationSeconds: number;
    member: MiraiMember;
    operator: MiraiMember | null;
}

export interface MiraiMemberUnmuteEvent {
    type: 'MemberUnmuteEvent';
    member: MiraiMember;
    operator: MiraiMember | null;
}

export interface MiraiMemberHonorChangeEvent {
    type: 'MemberHonorChangeEvent';
    member: MiraiMember;
    action: 'achieve' | 'lose';
    honor: string;
}

export interface MiraiNewFriendRequestEvent {
    type: 'NewFriendRequestEvent';
    eventId: number;
    fromId: number;
    groupId: number;
    nick: string;
    message: string;
}

export interface MiraiMemberJoinRequestEvent {
    type: 'MemberJoinRequestEvent';
    eventId: number;
    fromId: number;
    groupId: number;
    groupName: string;
    nick: string;
    message: string;
    invitorId: number | null;
}

export interface MiraiBotInvitedJoinGroupRequestEvent {
    type: 'BotInvitedJoinGroupRequestEvent';
    eventId: number;
    fromId: number;
    groupId: number;
    groupName: string;
    nick: string;
    message: string;
}

export interface MiraiFriendAddEvent {
    type: 'FriendAddEvent';
    friend: MiraiFriend;
    stranger: boolean;
}

export interface MiraiGroupAllowAnonymousChatEvent {
    type: 'GroupAllowAnonymousChatEvent';
    origin: boolean;
    current: boolean;
    group: MiraiGroup;
    operator: MiraiMember | null;
}

export interface MiraiGroupAllowConfessTalkEvent {
    type: 'GroupAllowConfessTalkEvent';
    origin: boolean;
    current: boolean;
    group: MiraiGroup;
    isByBot: boolean;
}

export interface MiraiGroupAllowMemberInviteEvent {
    type: 'GroupAllowMemberInviteEvent';
    origin: boolean;
    current: boolean;
    group: MiraiGroup;
    operator: MiraiMember | null;
}

export interface MiraiMemberSpecialTitleChangeEvent {
    type: 'MemberSpecialTitleChangeEvent';
    origin: string;
    current: string;
    member: MiraiMember;
}

export type MiraiEvent =
    | MiraiFriendMessage
    | MiraiGroupMessage
    | MiraiTempMessage
    | MiraiStrangerMessage
    | MiraiFriendSyncMessage
    | MiraiGroupSyncMessage
    | MiraiBotOnlineEvent
    | MiraiBotOfflineEventActive
    | MiraiBotOfflineEventForce
    | MiraiBotOfflineEventDropped
    | MiraiBotReloginEvent
    | MiraiFriendRecallEvent
    | MiraiGroupRecallEvent
    | MiraiNudgeEvent
    | MiraiBotGroupPermissionChangeEvent
    | MiraiBotMuteEvent
    | MiraiBotUnmuteEvent
    | MiraiBotJoinGroupEvent
    | MiraiBotLeaveEventActive
    | MiraiBotLeaveEventKick
    | MiraiGroupMuteAllEvent
    | MiraiGroupNameChangeEvent
    | MiraiMemberJoinEvent
    | MiraiMemberLeaveEventKick
    | MiraiMemberLeaveEventQuit
    | MiraiMemberCardChangeEvent
    | MiraiMemberPermissionChangeEvent
    | MiraiMemberMuteEvent
    | MiraiMemberUnmuteEvent
    | MiraiMemberHonorChangeEvent
    | MiraiNewFriendRequestEvent
    | MiraiMemberJoinRequestEvent
    | MiraiBotInvitedJoinGroupRequestEvent
    | MiraiFriendAddEvent
    | MiraiGroupAllowAnonymousChatEvent
    | MiraiGroupAllowConfessTalkEvent
    | MiraiGroupAllowMemberInviteEvent
    | MiraiMemberSpecialTitleChangeEvent;

// ==================== OB11 Types (simplified for internal use) ====================

export interface OB11MessageSegment {
    type: string;
    data: Record<string, unknown>;
}

export interface OB11Event {
    post_type: string;
    message_type?: string;
    sub_type?: string;
    notice_type?: string;
    request_type?: string;
    user_id?: number;
    group_id?: number;
    message_id?: number;
    message?: OB11MessageSegment[] | string;
    raw_message?: string;
    sender?: {
        user_id?: number;
        nickname?: string;
        card?: string;
        role?: string;
        sex?: string;
        age?: number;
    };
    time?: number;
    self_id?: number;
    operator_id?: number;
    duration?: number;
    comment?: string;
    flag?: string;
    target_id?: number;
    honor_type?: string;
    file?: {
        id?: string;
        name?: string;
        size?: number;
        busid?: number;
        url?: string;
    };
    [key: string]: unknown;
}

// ==================== Session Types ====================

export interface MiraiSession {
    sessionKey: string;
    qq: number | null;
    verified: boolean;
    messageQueue: MiraiEvent[];
    lastAccess: number;
}

// ==================== WebSocket Message Types ====================

export interface WsIncomingMessage {
    syncId: string | number;
    command: string;
    subCommand?: string | null;
    content?: Record<string, unknown>;
}

export interface WsOutgoingMessage {
    syncId: string | number;
    data: unknown;
}

// ==================== Cached Message ====================

export interface CachedMessage {
    messageId: number;
    messageChain: MiraiMessageChainElement[];
    sender: MiraiFriend | MiraiMember;
    type: 'FriendMessage' | 'GroupMessage' | 'TempMessage';
    target?: number;
    timestamp: number;
}
