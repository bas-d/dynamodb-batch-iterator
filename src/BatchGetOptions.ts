import {} from '@aws-sdk/client-dynamodb';

export interface BatchGetOptions {
    /**
     * The default read consistency to apply to gets.
     */
    ConsistentRead?: boolean;

    /**
     * Options to apply for all reads directed to a specific table.
     */
    PerTableOptions?: PerTableOptions;
}

export interface PerTableOptions {
    [tableName: string]: TableOptions;
}

export interface TableOptions {
    /**
     * The read consistency to apply to reads against this table.
     */
    ConsistentRead?: boolean;

    /**
     * One or more substitution tokens for attribute names in an expression.
     */
    ExpressionAttributeNames?: Record<string, string>;

    /**
     * A string that identifies one or more attributes to retrieve from the
     * table.
     */
    ProjectionExpression?: string;
}
