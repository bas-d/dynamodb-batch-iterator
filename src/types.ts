import { AttributeValue, WriteRequest } from '@aws-sdk/client-dynamodb';

/**
 * A synchronous or asynchronous iterable.
 */
export type SyncOrAsyncIterable<T> = Iterable<T> | AsyncIterable<T>;

/**
 * @internal
 */
export interface BatchState<Element extends TableStateElement> {
    [tableName: string]: TableState<Element>;
}

/**
 * @internal
 */
export interface TableState<Element extends TableStateElement> {
    attributeNames?: Record<string, string>;
    backoffFactor: number;
    consistentRead?: boolean;
    name: string;
    projection?: string;
    tableThrottling?: TableThrottlingTracker<Element>;
}

/**
 * @internal
 */
export type TableStateElement = Record<string, AttributeValue> | WriteRequest;

/**
 * @internal
 */
export interface TableThrottlingTracker<Element extends TableStateElement> {
    backoffWaiter: Promise<ThrottledTableConfiguration<Element>>;
    unprocessed: Array<Element>;
}

/**
 * @internal
 */
export interface ThrottledTableConfiguration<Element extends TableStateElement> extends TableState<Element> {
    tableThrottling?: TableThrottlingTracker<Element>;
}

// /**
//  * A write request for which exactly one of the `PutRequest` and `DeleteRequest`
//  * properties has been defined.
//  */
// export type WriteRequest =
//     | (DynamoDbWriteRequest & {
//           PutRequest: PutRequest;
//           DeleteRequest?: undefined;
//       })
//     | (DynamoDbWriteRequest & {
//           DeleteRequest: DeleteRequest;
//           PutRequest?: undefined;
//       });
