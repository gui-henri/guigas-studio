import { useMutation as useConnectMutation, createConnectQueryKey } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import type {
  DescMethodUnary,
  DescMessage,
  MessageInitShape,
  MessageShape,
} from "@bufbuild/protobuf";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RpcMutationOptions<I extends DescMessage, O extends DescMessage> {
  invalidate?: Array<DescMethodUnary<any, any>>;
  onSuccess?: (data: MessageShape<O>, variables: MessageInitShape<I>) => void;
  onError?: (error: Error, variables: MessageInitShape<I>) => void;
}

/**
 * Universal Connect-RPC mutation hook with TanStack Query auto-invalidation.
 */
export function useRpcMutation<I extends DescMessage, O extends DescMessage>(
  method: DescMethodUnary<I, O>,
  options?: RpcMutationOptions<I, O>
) {
  const queryClient = useQueryClient();

  return useConnectMutation(method, {
    onSuccess: (data, variables) => {
      if (options?.invalidate && options.invalidate.length > 0) {
        for (const targetMethod of options.invalidate) {
          queryClient.invalidateQueries({
            queryKey: createConnectQueryKey({ schema: targetMethod, cardinality: undefined }),
          });
        }
      }
      options?.onSuccess?.(data, variables);
    },
    onError: (err: Error, variables) => {
      options?.onError?.(err, variables);
    },
  });
}
