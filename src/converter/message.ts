import type {
    MiraiMessageChainElement,
    OB11MessageSegment,
    MiraiForwardNode,
} from '../types';

/**
 * Convert mirai message chain elements to OB11 message segments.
 * Skips Source elements (metadata only).
 */
export function miraiChainToOB11(chain: MiraiMessageChainElement[]): OB11MessageSegment[] {
    const segments: OB11MessageSegment[] = [];
    for (const elem of chain) {
        const seg = miraiElementToOB11(elem);
        if (seg) {
            if (Array.isArray(seg)) {
                segments.push(...seg);
            } else {
                segments.push(seg);
            }
        }
    }
    return segments;
}

function miraiElementToOB11(elem: MiraiMessageChainElement): OB11MessageSegment | OB11MessageSegment[] | null {
    switch (elem.type) {
        case 'Source':
            return null; // metadata, not a message segment

        case 'Plain':
            return { type: 'text', data: { text: elem.text } };

        case 'At':
            return { type: 'at', data: { qq: String(elem.target) } };

        case 'AtAll':
            return { type: 'at', data: { qq: 'all' } };

        case 'Face':
            return { type: 'face', data: { id: String(elem.faceId ?? 0) } };

        case 'Image': {
            const data: Record<string, unknown> = {};
            if (elem.url) data.file = elem.url;
            else if (elem.base64) data.file = `base64://${elem.base64}`;
            else if (elem.path) data.file = elem.path;
            else if (elem.imageId) data.file = elem.imageId;
            if (elem.url) data.url = elem.url;
            return { type: 'image', data };
        }

        case 'FlashImage': {
            const data: Record<string, unknown> = { type: 'flash' };
            if (elem.url) data.file = elem.url;
            else if (elem.base64) data.file = `base64://${elem.base64}`;
            else if (elem.path) data.file = elem.path;
            else if (elem.imageId) data.file = elem.imageId;
            if (elem.url) data.url = elem.url;
            return { type: 'image', data };
        }

        case 'Voice': {
            const data: Record<string, unknown> = {};
            if (elem.url) data.file = elem.url;
            else if (elem.base64) data.file = `base64://${elem.base64}`;
            else if (elem.path) data.file = elem.path;
            else if (elem.voiceId) data.file = elem.voiceId;
            if (elem.url) data.url = elem.url;
            return { type: 'record', data };
        }

        case 'Quote':
            return { type: 'reply', data: { id: String(elem.id) } };

        case 'Xml':
            return { type: 'xml', data: { data: elem.xml } };

        case 'Json':
            return { type: 'json', data: { data: elem.json } };

        case 'App':
            return { type: 'json', data: { data: elem.content } };

        case 'Poke':
            // Poke is not a standard OB11 segment; it's sent via API
            return null;

        case 'Dice':
            return { type: 'dice', data: { value: String(elem.value) } };

        case 'MusicShare': {
            const data: Record<string, unknown> = {
                type: 'custom',
                url: elem.jumpUrl,
                audio: elem.musicUrl,
                title: elem.title,
                image: elem.pictureUrl,
                singer: elem.summary,
            };
            return { type: 'music', data };
        }

        case 'Forward': {
            const nodes: OB11MessageSegment[] = elem.nodeList.map((node) => ({
                type: 'node',
                data: {
                    ...(node.senderId ? { user_id: String(node.senderId) } : {}),
                    ...(node.senderName ? { nickname: node.senderName } : {}),
                    ...(node.messageChain ? { content: miraiChainToOB11(node.messageChain) } : {}),
                    ...(node.messageId ? { id: String(node.messageId) } : {}),
                },
            }));
            return nodes;
        }

        case 'File': {
            return { type: 'file', data: { name: elem.name, file: elem.id, file_id: elem.id } };
        }

        case 'MarketFace':
            return { type: 'face', data: { id: String(elem.id) } };

        case 'ShortVideo': {
            const data: Record<string, unknown> = {};
            if (elem.videoUrl) data.file = elem.videoUrl;
            if (elem.videoUrl) data.url = elem.videoUrl;
            return { type: 'video', data };
        }

        case 'MiraiCode':
            return { type: 'text', data: { text: elem.code } };

        default:
            return null;
    }
}

/**
 * Convert OB11 message segments to mirai message chain elements.
 */
export function ob11ToMiraiChain(segments: OB11MessageSegment[] | string, messageId?: number): MiraiMessageChainElement[] {
    const chain: MiraiMessageChainElement[] = [];

    // Add Source element
    if (messageId !== undefined) {
        chain.push({
            type: 'Source',
            id: messageId,
            time: Math.floor(Date.now() / 1000),
        });
    }

    if (typeof segments === 'string') {
        chain.push({ type: 'Plain', text: segments });
        return chain;
    }

    for (const seg of segments) {
        const elem = ob11SegmentToMirai(seg);
        if (elem) {
            if (Array.isArray(elem)) {
                chain.push(...elem);
            } else {
                chain.push(elem);
            }
        }
    }
    return chain;
}

function ob11SegmentToMirai(seg: OB11MessageSegment): MiraiMessageChainElement | MiraiMessageChainElement[] | null {
    const d = seg.data || {};
    switch (seg.type) {
        case 'text':
            return { type: 'Plain', text: String(d.text ?? '') };

        case 'face':
            return { type: 'Face', faceId: Number(d.id ?? 0) };

        case 'image': {
            const isFlash = d.type === 'flash';
            const base: Record<string, unknown> = {};
            const file = String(d.file ?? d.url ?? '');
            if (file.startsWith('base64://')) {
                base.base64 = file.slice(9);
            } else if (file.startsWith('http://') || file.startsWith('https://')) {
                base.url = file;
            } else if (file) {
                base.imageId = file;
            }
            if (d.url) base.url = String(d.url);
            if (isFlash) {
                return { type: 'FlashImage', ...base } as MiraiMessageChainElement;
            }
            return { type: 'Image', ...base } as MiraiMessageChainElement;
        }

        case 'record': {
            const base: Record<string, unknown> = {};
            const file = String(d.file ?? d.url ?? '');
            if (file.startsWith('base64://')) {
                base.base64 = file.slice(9);
            } else if (file.startsWith('http://') || file.startsWith('https://')) {
                base.url = file;
            } else if (file) {
                base.voiceId = file;
            }
            if (d.url) base.url = String(d.url);
            return { type: 'Voice', ...base } as MiraiMessageChainElement;
        }

        case 'video': {
            const base: Record<string, unknown> = {};
            const file = String(d.file ?? d.url ?? '');
            if (file.startsWith('http://') || file.startsWith('https://')) {
                base.videoUrl = file;
            } else if (file) {
                base.videoId = file;
            }
            if (d.url) base.videoUrl = String(d.url);
            return { type: 'ShortVideo', ...base } as MiraiMessageChainElement;
        }

        case 'at': {
            const qq = String(d.qq ?? '');
            if (qq === 'all') {
                return { type: 'AtAll' };
            }
            return { type: 'At', target: Number(qq) };
        }

        case 'reply':
            return { type: 'Quote', id: Number(d.id ?? 0) };

        case 'xml':
            return { type: 'Xml', xml: String(d.data ?? '') };

        case 'json':
            return { type: 'Json', json: String(d.data ?? '') };

        case 'music': {
            const kind = String(d.type ?? 'custom');
            return {
                type: 'MusicShare',
                kind,
                title: String(d.title ?? ''),
                summary: String(d.singer ?? d.content ?? ''),
                jumpUrl: String(d.url ?? ''),
                pictureUrl: String(d.image ?? ''),
                musicUrl: String(d.audio ?? ''),
                brief: String(d.title ?? ''),
            };
        }

        case 'forward': {
            // When receiving a forward message from OB11, content may already be parsed
            const content = d.content as OB11MessageSegment[][] | undefined;
            const nodeList: MiraiForwardNode[] = [];
            if (content && Array.isArray(content)) {
                for (const msg of content) {
                    nodeList.push({
                        senderName: 'Unknown',
                        senderId: 0,
                        time: Math.floor(Date.now() / 1000),
                        messageChain: ob11ToMiraiChain(msg),
                    });
                }
            }
            return { type: 'Forward', nodeList };
        }

        case 'node': {
            // Forward node - this should not appear standalone but handle it anyway
            const nodeChain: MiraiMessageChainElement[] = [];
            if (d.content && Array.isArray(d.content)) {
                nodeChain.push(...ob11ToMiraiChain(d.content as OB11MessageSegment[]));
            }
            return nodeChain.length > 0 ? nodeChain : null;
        }

        case 'dice':
            return { type: 'Dice', value: Number(d.value ?? 1) };

        case 'poke':
            return { type: 'Poke', name: String(d.type ?? 'Poke') };

        case 'contact':
            // No direct mirai equivalent, convert to text
            return { type: 'Plain', text: `[Contact: ${d.type}:${d.id}]` };

        case 'location':
            return { type: 'Plain', text: `[Location: ${d.lat},${d.lon} ${d.title ?? ''}]` };

        case 'share':
            return { type: 'Plain', text: `[Share: ${d.title} ${d.url}]` };

        case 'file': {
            return {
                type: 'File',
                id: String(d.file_id ?? d.file ?? ''),
                name: String(d.name ?? ''),
                size: Number(d.file_size ?? 0),
            };
        }

        case 'mface':
            // QQ emoji pack - treat as image
            return {
                type: 'Image',
                url: String(d.url ?? ''),
                imageId: String(d.emoji_id ?? ''),
            } as MiraiMessageChainElement;

        default:
            return null;
    }
}
