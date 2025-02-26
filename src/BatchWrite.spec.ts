import { BatchWrite, MAX_WRITE_BATCH_SIZE } from './BatchWrite';
// import { WriteRequest } from './types';
import { BatchWriteItemCommand, BatchWriteItemCommandOutput, WriteRequest } from '@aws-sdk/client-dynamodb';

describe('BatchWrite', () => {
    const mockDynamoDbClient = {
        config: {},
        send: jest.fn(() =>
            Promise.resolve({
                UnprocessedItems: {}
            } as BatchWriteItemCommandOutput)
        )
    };

    beforeEach(() => {
        mockDynamoDbClient.send.mockClear();
    });

    it('should return itself when its Symbol.asyncIterator method is called', () => {
        const batchWrite = new BatchWrite({} as any, []);
        expect(batchWrite[Symbol.asyncIterator]()).toBe(batchWrite);
    });

    for (const asyncInput of [true, false]) {
        it(`should should partition write batches into requests with ${MAX_WRITE_BATCH_SIZE} or fewer items`, async () => {
            const writes: Array<[string, WriteRequest]> = [];
            const expected: any = [
                [
                    new BatchWriteItemCommand({
                        RequestItems: {
                            snap: [],
                            crackle: [],
                            pop: []
                        }
                    })
                ],
                [
                    new BatchWriteItemCommand({
                        RequestItems: {
                            snap: [],
                            crackle: [],
                            pop: []
                        }
                    })
                ],
                [
                    new BatchWriteItemCommand({
                        RequestItems: {
                            snap: [],
                            crackle: [],
                            pop: []
                        }
                    })
                ],
                [
                    new BatchWriteItemCommand({
                        RequestItems: {
                            snap: [],
                            crackle: [],
                            pop: []
                        }
                    })
                ]
            ];

            for (let i = 0; i < 80; i++) {
                const table = i % 3 === 0 ? 'snap' : i % 3 === 1 ? 'crackle' : 'pop';
                const fizz = { N: String(i) };
                const req: WriteRequest =
                    i % 2 === 0 ? { DeleteRequest: { Key: { fizz } } } : { PutRequest: { Item: { fizz } } };
                writes.push([table, req]);
                expected[Math.floor(i / MAX_WRITE_BATCH_SIZE)][0].input.RequestItems[table].push(req);
            }

            const input = asyncInput
                ? (async function* () {
                      for (const item of writes) {
                          await new Promise((resolve) => setTimeout(resolve, Math.round(Math.random())));
                          yield item;
                      }
                  })()
                : writes;

            for await (const [tableName, req] of new BatchWrite(mockDynamoDbClient as any, input)) {
                const id = req.DeleteRequest?.Key
                    ? parseInt(req.DeleteRequest.Key.fizz.N as string)
                    : parseInt((req.PutRequest as any).Item.fizz.N as string);

                if (id % 3 === 0) {
                    expect(tableName).toBe('snap');
                } else if (id % 3 === 1) {
                    expect(tableName).toBe('crackle');
                } else {
                    expect(tableName).toBe('pop');
                }
            }

            const { calls } = mockDynamoDbClient.send.mock;
            expect(calls.length).toBe(Math.ceil(writes.length / MAX_WRITE_BATCH_SIZE));
            calls.forEach((call, index) => {
                //@ts-ignore
                expect(call[0].input).toEqual(expected[index][0].input);
            });
        });

        it('should should retry unprocessed items', async () => {
            const failures = new Set(['21', '24', '38', '43', '55', '60']);
            const writes: Array<[string, WriteRequest]> = [];
            const unprocessed = new Map<string, WriteRequest>();

            for (let i = 0; i < 80; i++) {
                const table = i % 3 === 0 ? 'snap' : i % 3 === 1 ? 'crackle' : 'pop';
                const fizz = { N: String(i) };
                //@ts-ignore
                const req: WriteRequest =
                    i % 2 === 0
                        ? { DeleteRequest: { Key: { fizz } } }
                        : {
                              PutRequest: {
                                  Item: {
                                      fizz,
                                      buzz: { B: new ArrayBuffer(3) },
                                      pop: { B: Uint8Array.from([i]) },
                                      foo: { B: String.fromCharCode(i + 32) },
                                      quux: { S: 'string' }
                                  }
                              }
                          };
                writes.push([table, req]);

                if (failures.has(fizz.N)) {
                    unprocessed.set(fizz.N, req);
                }
            }

            mockDynamoDbClient.send.mockImplementation(async () => {
                const response: BatchWriteItemCommandOutput = {
                    $metadata: {}
                };

                const { RequestItems } = (mockDynamoDbClient.send.mock.calls.slice(-1)[0] as any)[0].input;
                for (const tableName of Object.keys(RequestItems)) {
                    for (const { DeleteRequest, PutRequest } of RequestItems[tableName]) {
                        const item = DeleteRequest ? DeleteRequest.Key : PutRequest.Item;
                        if (unprocessed.has(item.fizz.N)) {
                            if (!response.UnprocessedItems) {
                                response.UnprocessedItems = {};
                            }

                            if (!(tableName in response.UnprocessedItems)) {
                                response.UnprocessedItems[tableName] = [];
                            }

                            response.UnprocessedItems[tableName].push(unprocessed.get(item.fizz.N) as object);
                            unprocessed.delete(item.fizz.N);
                        }
                    }
                }

                return response;
            });

            const input = asyncInput
                ? (async function* () {
                      for (const item of writes) {
                          await new Promise((resolve) => setTimeout(resolve, Math.round(Math.random())));
                          yield item;
                      }
                  })()
                : writes;

            const seen = new Set<number>();
            for await (const [tableName, req] of new BatchWrite(mockDynamoDbClient as any, input)) {
                const id = req.DeleteRequest
                    ? parseInt(req.DeleteRequest?.Key?.fizz.N as string)
                    : parseInt((req.PutRequest as any).Item.fizz.N as string);

                expect(seen.has(id)).toBe(false);
                seen.add(id);

                if (id % 3 === 0) {
                    expect(tableName).toBe('snap');
                } else if (id % 3 === 1) {
                    expect(tableName).toBe('crackle');
                } else {
                    expect(tableName).toBe('pop');
                }
            }

            expect(seen.size).toBe(writes.length);

            const { calls } = mockDynamoDbClient.send.mock;
            expect(calls.length).toBe(Math.ceil(writes.length / MAX_WRITE_BATCH_SIZE));

            const callCount: { [key: string]: number } = (calls as Array<Array<BatchWriteItemCommand>>).reduce(
                (keyUseCount: { [key: string]: number }, call) => {
                    const { RequestItems } = call[0].input;
                    if (RequestItems != null) {
                        for (const table of Object.keys(RequestItems)) {
                            RequestItems[table].forEach(({ PutRequest, DeleteRequest }) => {
                                let key = DeleteRequest?.Key
                                    ? DeleteRequest.Key.fizz.N
                                    : (PutRequest as any).Item.fizz.N;
                                if (key in keyUseCount) {
                                    keyUseCount[key]++;
                                } else {
                                    keyUseCount[key] = 1;
                                }
                            });
                        }
                    }
                    return keyUseCount;
                },
                {}
            );

            for (let i = 0; i < writes.length; i++) {
                expect(callCount[i]).toBe(failures.has(String(i)) ? 2 : 1);
            }
        });
    }
});
