import { defineConfig } from 'orval';

export default defineConfig({
  backend: {
    input: {
      target: '../backend/swagger.json',
      validation: false,
    },
    output: {
      target: './src/lib/orval/orval.ts',
      clean: true,
      client: 'react-query',
      prettier: true,
      override: {
        mutator: {
          path: './src/lib/axios/index.ts',
          name: 'orvalAxiosInstance',
        },
        query: {
          useQuery: true,
          useSuspenseQuery: true,
          version: 5,
        },
      },
    },
  },
});
