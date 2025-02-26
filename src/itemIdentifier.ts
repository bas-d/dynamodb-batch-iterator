import { AttributeValue, WriteRequest } from '@aws-sdk/client-dynamodb';
const bytes = require('utf8-bytes');

/**
 * @internal
 */
export function itemIdentifier(tableName: string, { DeleteRequest, PutRequest }: WriteRequest): string {
    if (DeleteRequest?.Key != null) {
        return `${tableName}::delete::${serializeKeyTypeAttributes(DeleteRequest.Key)}`;
    } else if (PutRequest?.Item != null) {
        return `${tableName}::put::${serializeKeyTypeAttributes(PutRequest.Item)}`;
    }

    throw new Error(`Invalid write request provided`);
}

function serializeKeyTypeAttributes(attributes: Record<string, AttributeValue>): string {
    const keyTypeProperties: Array<string> = [];
    for (const property of Object.keys(attributes).sort()) {
        const attribute = attributes[property];
        if (attribute.B) {
            keyTypeProperties.push(`${property}=${toByteArray(attribute.B)}`);
        } else if (attribute.N) {
            keyTypeProperties.push(`${property}=${attribute.N}`);
        } else if (attribute.S) {
            keyTypeProperties.push(`${property}=${attribute.S}`);
        }
    }

    return keyTypeProperties.join('&');
}

function toByteArray(value: any): Uint8Array {
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }

    if (typeof value === 'string') {
        return Uint8Array.from(bytes(value));
    }

    if (isArrayBuffer(value)) {
        return new Uint8Array(value);
    }

    throw new Error('Unrecognized binary type');
}

function isArrayBuffer(arg: any): arg is ArrayBuffer {
    return (
        (typeof ArrayBuffer === 'function' && arg instanceof ArrayBuffer) ||
        Object.prototype.toString.call(arg) === '[object ArrayBuffer]'
    );
}
