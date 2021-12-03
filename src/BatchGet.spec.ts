import { BatchGet, MAX_READ_BATCH_SIZE } from './BatchGet';
import {
    AttributeValue,
    BatchGetItemCommand,
    BatchGetItemCommandInput,
    BatchGetItemCommandOutput
} from '@aws-sdk/client-dynamodb';

describe('BatchGet', () => {
    const mockDynamoDbClient = {
        config: {},
        send: jest.fn(() =>
            Promise.resolve({
                UnprocessedKeys: {}
            } as BatchGetItemCommandOutput)
        )
    };

    beforeEach(() => {
        mockDynamoDbClient.send.mockClear();
    });

    it('should return itself when its Symbol.asyncIterator method is called', () => {
        const batchGet = new BatchGet({} as any, []);
        expect(batchGet[Symbol.asyncIterator]()).toBe(batchGet);
    });

    it('should allow setting an overall read consistency', async () => {
        const batchGet = new BatchGet(mockDynamoDbClient as any, [['foo', { fizz: { N: '0' } }]], {
            ConsistentRead: true
        });
        for await (const _ of batchGet) {
            console.log(_ === undefined);
            // pass
        }

        //@ts-ignore
        expect(mockDynamoDbClient.send.mock.calls[0][0].input).toEqual({
            RequestItems: {
                foo: {
                    Keys: [{ fizz: { N: '0' } }],
                    ConsistentRead: true
                }
            }
        });
    });

    it('should allow setting per-table read consistency', async () => {
        const batchGet = new BatchGet(
            mockDynamoDbClient as any,
            [
                ['foo', { fizz: { N: '0' } }],
                ['bar', { quux: { N: '1' } }]
            ],
            {
                ConsistentRead: true,
                PerTableOptions: {
                    bar: { ConsistentRead: false }
                }
            }
        );

        for await (const _ of batchGet) {
            // pass
        }

        //@ts-ignore
        expect(mockDynamoDbClient.send.mock.calls[0][0].input).toEqual({
            RequestItems: {
                foo: {
                    Keys: [{ fizz: { N: '0' } }],
                    ConsistentRead: true
                },
                bar: {
                    Keys: [{ quux: { N: '1' } }],
                    ConsistentRead: false
                }
            }
        });
    });

    it('should allow specifying per-table projection expressions', async () => {
        const batchGet = new BatchGet(
            mockDynamoDbClient as any,
            [
                ['foo', { fizz: { N: '0' } }],
                ['bar', { quux: { N: '1' } }]
            ],
            {
                PerTableOptions: {
                    bar: {
                        ProjectionExpression: 'snap[1].crackle.pop[2]'
                    }
                }
            }
        );

        for await (const _ of batchGet) {
            // pass
        }

        //@ts-ignore
        expect(mockDynamoDbClient.send.mock.calls[0][0].input).toEqual({
            RequestItems: {
                foo: {
                    Keys: [{ fizz: { N: '0' } }]
                },
                bar: {
                    Keys: [{ quux: { N: '1' } }],
                    ProjectionExpression: 'snap[1].crackle.pop[2]'
                }
            }
        });
    });

    for (const asyncInput of [true, false]) {
        it(`should should partition get batches into requests with ${MAX_READ_BATCH_SIZE} or fewer items`, async () => {
            const gets: Array<[string, Record<string, AttributeValue>]> = [];
            const expected: any = [
                [
                    new BatchGetItemCommand({
                        RequestItems: {
                            snap: { Keys: [] },
                            crackle: { Keys: [] },
                            pop: { Keys: [] }
                        }
                    })
                ],
                [
                    new BatchGetItemCommand({
                        RequestItems: {
                            snap: { Keys: [] },
                            crackle: { Keys: [] },
                            pop: { Keys: [] }
                        }
                    })
                ],
                [
                    new BatchGetItemCommand({
                        RequestItems: {
                            snap: { Keys: [] },
                            crackle: { Keys: [] },
                            pop: { Keys: [] }
                        }
                    })
                ],
                [
                    new BatchGetItemCommand({
                        RequestItems: {
                            snap: { Keys: [] },
                            crackle: { Keys: [] },
                            pop: { Keys: [] }
                        }
                    })
                ]
            ];
            const responses: BatchGetItemCommandOutput[] = [
                {
                    $metadata: {},
                    Responses: {
                        snap: [],
                        crackle: [],
                        pop: []
                    }
                },
                {
                    $metadata: {},
                    Responses: {
                        snap: [],
                        crackle: [],
                        pop: []
                    }
                },
                {
                    $metadata: {},
                    Responses: {
                        snap: [],
                        crackle: [],
                        pop: []
                    }
                },
                {
                    $metadata: {},
                    Responses: {
                        snap: [],
                        crackle: [],
                        pop: []
                    }
                }
            ];

            for (let i = 0; i < 325; i++) {
                const table = i % 3 === 0 ? 'snap' : i % 3 === 1 ? 'crackle' : 'pop';
                const fizz = { N: String(i) };
                const buzz = { S: 'Static string' };
                gets.push([table, { fizz: { N: String(i) } }]);

                responses?.[Math.floor(i / MAX_READ_BATCH_SIZE)]?.Responses?.[table].push({
                    fizz,
                    buzz
                });
                expected[Math.floor(i / MAX_READ_BATCH_SIZE)][0].input.RequestItems[table].ConsistentRead = undefined;
                expected[Math.floor(i / MAX_READ_BATCH_SIZE)][0].input.RequestItems[table].ExpressionAttributeNames =
                    undefined;
                expected[Math.floor(i / MAX_READ_BATCH_SIZE)][0].input.RequestItems[table].ProjectionExpression =
                    undefined;
                expected[Math.floor(i / MAX_READ_BATCH_SIZE)][0].input.RequestItems[table].Keys.push({ fizz });
            }

            for (const response of responses) {
                mockDynamoDbClient.send.mockImplementationOnce(() => Promise.resolve(response));
            }

            const input = asyncInput
                ? (async function* () {
                      for (const item of gets) {
                          await new Promise((resolve) => setTimeout(resolve, Math.round(Math.random())));
                          yield item;
                      }
                  })()
                : gets;

            const seen = new Set<number>();
            for await (const [table, item] of new BatchGet(mockDynamoDbClient as any, input)) {
                const id = parseInt(item.fizz.N as string);
                expect(seen.has(id)).toBe(false);
                seen.add(id);

                if (id % 3 === 0) {
                    expect(table).toBe('snap');
                } else if (id % 3 === 1) {
                    expect(table).toBe('crackle');
                } else {
                    expect(table).toBe('pop');
                }

                expect(item.buzz).toEqual({ S: 'Static string' });
            }

            expect(seen.size).toBe(gets.length);

            const { calls } = mockDynamoDbClient.send.mock;
            expect(calls.length).toBe(Math.ceil(gets.length / MAX_READ_BATCH_SIZE));
            calls.forEach((call, index) => {
                //@ts-ignore
                expect(call[0].input).toEqual(expected[index][0].input);
            });
        });

        it('should should retry unprocessed items', async () => {
            const failures = new Set(['24', '66', '99', '103', '142', '178', '204', '260', '288']);
            const gets: Array<[string, Record<string, AttributeValue>]> = [];

            for (let i = 0; i < 325; i++) {
                const table = i % 3 === 0 ? 'snap' : i % 3 === 1 ? 'crackle' : 'pop';
                gets.push([table, { fizz: { N: String(i) } }]);
            }

            const toBeFailed = new Set(failures);
            mockDynamoDbClient.send.mockImplementation(async () => {
                const buzz = { S: 'Static string' };
                const response: BatchGetItemCommandOutput = {
                    $metadata: {}
                };

                const { RequestItems } = (mockDynamoDbClient.send.mock.calls.slice(-1)[0] as any)[0].input;
                for (const tableName of Object.keys(RequestItems)) {
                    for (const item of RequestItems[tableName].Keys) {
                        if (toBeFailed.has(item.fizz.N)) {
                            if (!response.UnprocessedKeys) {
                                response.UnprocessedKeys = {};
                            }

                            if (!(tableName in response.UnprocessedKeys)) {
                                response.UnprocessedKeys[tableName] = { Keys: [] };
                            }

                            response.UnprocessedKeys?.[tableName]?.Keys?.push(item);
                            toBeFailed.delete(item.fizz.N);
                        } else {
                            if (!response.Responses) {
                                response.Responses = {};
                            }

                            if (!(tableName in response.Responses)) {
                                response.Responses[tableName] = [];
                            }

                            response.Responses[tableName].push({
                                ...item,
                                buzz
                            });
                        }
                    }
                }

                return Promise.resolve(response);
            });

            const input = asyncInput
                ? (async function* () {
                      for (const item of gets) {
                          await new Promise((resolve) => setTimeout(resolve, Math.round(Math.random())));
                          yield item;
                      }
                  })()
                : gets;

            let idsReturned = new Set<number>();
            for await (const [table, item] of new BatchGet(mockDynamoDbClient as any, input)) {
                const id = parseInt(item.fizz.N as string);
                expect(idsReturned.has(id)).toBe(false);
                idsReturned.add(id);

                if (id % 3 === 0) {
                    expect(table).toBe('snap');
                } else if (id % 3 === 1) {
                    expect(table).toBe('crackle');
                } else {
                    expect(table).toBe('pop');
                }

                expect(item.buzz).toEqual({ S: 'Static string' });
            }

            expect(idsReturned.size).toBe(gets.length);
            expect(toBeFailed.size).toBe(0);

            const { calls } = mockDynamoDbClient.send.mock;
            expect(calls.length).toBe(Math.ceil(gets.length / MAX_READ_BATCH_SIZE));

            const callCount: { [key: string]: number } = (calls as Array<Array<BatchGetItemCommandInput>>).reduce(
                (keyUseCount: { [key: string]: number }, call) => {
                    //@ts-ignore
                    const { RequestItems } = call[0].input;
                    const keys = [];
                    if (RequestItems != null) {
                        for (const table of Object.keys(RequestItems)) {
                            const k = RequestItems[table]?.Keys;
                            if (k != null) {
                                keys.push(...k);
                            }
                        }
                    }
                    for (const {
                        fizz: { N: key }
                    } of keys) {
                        if (key) {
                            if (key in keyUseCount) {
                                keyUseCount[key]++;
                            } else {
                                keyUseCount[key] = 1;
                            }
                        }
                    }

                    return keyUseCount;
                },
                {}
            );

            for (let i = 0; i < gets.length; i++) {
                expect(callCount[i]).toBe(failures.has(String(i)) ? 2 : 1);
            }
        });
    }
});
