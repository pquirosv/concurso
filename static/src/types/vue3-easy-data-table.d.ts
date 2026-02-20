declare module 'vue3-easy-data-table' {
  import type { DefineComponent } from 'vue';

  export type Header = {
    text: string;
    value: string;
    sortable?: boolean;
    fixed?: boolean;
    width?: number;
  };

  const Vue3EasyDataTable: DefineComponent;
  export default Vue3EasyDataTable;
}
