import React from 'react';
import { FileSpreadsheet, FileText, Database } from 'lucide-react';

export const IntegrationsPage = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center text-center space-y-4">
        <div className="bg-green-900/30 p-4 rounded-full">
          <FileSpreadsheet className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-lg font-bold text-white">Excel / CSV</h3>
        <p className="text-gray-400 text-xs">Выгрузка остатков.</p>
        <button className="mt-auto bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm w-full">
          Скачать .CSV
        </button>
      </div>
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center text-center space-y-4">
        <div className="bg-blue-900/30 p-4 rounded-full">
          <FileText className="w-8 h-8 text-blue-500" />
        </div>
        <h3 className="text-lg font-bold text-white">Google Docs</h3>
        <p className="text-gray-400 text-xs">Создать отчет в Docs.</p>
        <button className="mt-auto bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm w-full">
          Создать отчет
        </button>
      </div>
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col items-center text-center space-y-4">
        <div className="bg-red-900/30 p-4 rounded-full">
          <Database className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-white">1С:Предприятие</h3>
        <p className="text-gray-400 text-xs">Синхронизация с ERP.</p>
        <button className="mt-auto bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm w-full">
          Синхронизация
        </button>
      </div>
    </div>
  );
};
