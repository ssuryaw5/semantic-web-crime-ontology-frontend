export const formatData = async (rawData) => {
    // Extract column headers and rows
    const { columnHeaders, rows } = rawData?.formattedResponse || {};
  
    const formattedRows = await Promise.all(
      rows.map(async (row) => {
        return columnHeaders.map((header) => row[header] || '');
      })
    );
  
    return { columnHeaders, formattedRows };
  };