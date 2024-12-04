import { useState, useEffect } from "react";
import axios from "axios";
import { formatData } from "../utils/dataFormatter.js";

const queries = [
  {
    label: "High Risk Areas",
    value: "HighRiskAreas",
    query: `PREFIX smw: <http://www.semanticweb.org/ontologies/2024/10/crime-ontology#>
            SELECT ?location (COUNT(?crime) AS ?crimeCount)
            WHERE {
              ?crime a smw:Crime ;
                     smw:hasLocation ?location .
            }
            GROUP BY ?location
            ORDER BY DESC(?crimeCount)`,
  },
  {
    label: "Victim Race by Region",
    value: "VictimRaceByRegion",
    query: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX smw: <http://www.semanticweb.org/ontologies/2024/10/crime-ontology#>
            PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
            SELECT ?location ?race (COUNT(?crime) AS ?crimeCount)
            WHERE {
              ?crime a smw:Crime ;
                     smw:hasLocation ?location ;
                     smw:hasVictim ?victim .
              ?victim smw:hasRace ?race .
            }
            GROUP BY ?location ?race
            ORDER BY DESC(?crimeCount)`,
  },
  {
    label: "Victim Age Group by Region",
    value: "VictimAgeGroupByRegion",
    query: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX smw: <http://www.semanticweb.org/ontologies/2024/10/crime-ontology#>
            PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
            SELECT ?location ?age (COUNT(?crime) AS ?crimeCount)
            WHERE {
              ?crime a smw:Crime ;
                     smw:hasLocation ?location ;
                     smw:hasVictim ?victim .
              ?victim smw:hasAgeGroup ?age .
            }
            GROUP BY ?location ?age
            ORDER BY DESC(?crimeCount)`,
  },
  {
    label: "Victim Sex by Region",
    value: "VictimSexByRegion",
    query: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX smw: <http://www.semanticweb.org/ontologies/2024/10/crime-ontology#>
            PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
            SELECT ?location ?sex (COUNT(?crime) AS ?crimeCount)
            WHERE {
              ?crime a smw:Crime ;
                     smw:hasLocation ?location ;
                     smw:hasVictim ?victim .
              ?victim smw:hasSex ?sex .
            }
            GROUP BY ?location ?sex
            ORDER BY DESC(?crimeCount)`,
  },
  {
    label: "Holiday Crime",
    value: "TemporalPatternHolidayCrime",
    query: `PREFIX smw: <http://www.semanticweb.org/ontologies/2024/10/crime-ontology#>
            SELECT ?crime ?location ?date ?time
            WHERE {
              ?crime a smw:Crime ;
                     smw:hasLocation ?location ;
                     smw:hasDate ?date ;
                     smw:occurredDuring ?time ;
                     smw:occursOnHoliday ?isHoliday .
              FILTER(UCASE(?isHoliday) = "TRUE")
            }`,
  },
  {
    label: "Holiday Crimes vs Non-Holiday Crimes",
    value: "HolidayAndNonHolidayCrimes",
    query: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX smw: <http://www.semanticweb.org/ontologies/2024/10/crime-ontology#>
            PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
            SELECT ?standardHoliday
                   (COUNT(?crime) AS ?crimeCount)
                   (COUNT(DISTINCT ?date) AS ?dayCount)
                   (COUNT(?crime) / COUNT(DISTINCT ?date) AS ?avgCrimesPerDay)
            WHERE {
              ?crime a smw:Crime ;
                     smw:occurredDuring ?time ;
                     smw:occursOnHoliday ?isHoliday ;
                     smw:hasDate ?date .
              BIND(UCASE(?isHoliday) AS ?standardHoliday)
            }
            GROUP BY ?standardHoliday`,
  },
  {
    label: "Crime by Hours of the Day",
    value: "CrimeByHoursOfDay",
    query: `PREFIX smw: <http://www.semanticweb.org/ontologies/2024/10/crime-ontology#>
            PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
            SELECT ?timePeriod (COUNT(?crime) AS ?crimeCount)
            WHERE {
              ?crime a smw:Crime ;
                     smw:occurredDuring ?time .
              ?time smw:hasHour ?hour .
              BIND (
                IF(xsd:integer(?hour) >= 0 && xsd:integer(?hour) <= 5, "0-5",
                IF(xsd:integer(?hour) >= 6 && xsd:integer(?hour) <= 11, "6-11",
                IF(xsd:integer(?hour) >= 12 && xsd:integer(?hour) <= 17, "12-17", "18-23"))) AS ?timePeriod
              )
            }
            GROUP BY ?timePeriod
            ORDER BY ?timePeriod`,
  },
  {
    label: "Crimes by Premise Type",
    value: "CrimeByPremiseType",
    query: `PREFIX smw: <http://www.semanticweb.org/ontologies/2024/10/crime-ontology#>
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            SELECT ?normalizedPremiseType (COUNT(?crime) AS ?crimeCount)
            WHERE {
              ?crime a smw:Crime ;
                     smw:hasLocation ?location .
              ?location smw:hasPremiseType ?premiseType .
              BIND(LCASE(STR(?premiseType)) AS ?normalizedPremiseType)
            }
            GROUP BY ?normalizedPremiseType
            ORDER BY ?normalizedPremiseType`,
  },
];

const QuerySelector = () => {
  const [selectedQuery, setSelectedQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [fetchClicked, setFetchClicked] = useState(false);

  const handleQueryChange = (event) => {
    setSelectedQuery(event.target.value);
    setPage(1);
    setData(null);
    setFetchClicked(false);
  };

  const fetchData = async () => {
    if (!selectedQuery) return;

    setLoading(true);
    setError("");
    setFetchClicked(true);
    setData(null);

    try {
      const selectedQueryObject = queries.find(
        (query) => query.value === selectedQuery
      );

      setData(null);

      const response = await axios.post(
        `http://localhost:3000/api/v1/semantic-web-crime-ontology?page=${page}&pageSize=${pageSize}`,
        {
          query: selectedQueryObject.query,
        }
      );

      const formattedData = await new Promise((resolve) => {
        const formatted = formatData(response.data.data);
        resolve(formatted);
      });

      setData(formattedData);

      setTotalPages(response.data.data.pagination.totalPages);
    } catch (err) {
      setError("Error fetching data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedQuery && fetchClicked) {
      fetchData();
    }
  }, [page, selectedQuery, fetchClicked]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const getPageNumbers = () => {
    const pageNumbers = [];
    const range = 2;

    for (
      let i = Math.max(1, page - range);
      i <= Math.min(totalPages, page + range);
      i++
    ) {
      pageNumbers.push(i);
    }

    return pageNumbers;
  };

  return (
    <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-lg">
      <h1 className="text-3xl font-semibold text-center text-gray-800 mb-6">
        Crime Data Queries
      </h1>

      <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4 mb-6">
        <select
          onChange={handleQueryChange}
          value={selectedQuery}
          className="border border-gray-300 rounded-lg p-2 w-full sm:w-64"
        >
          <option value="">Select a query</option>
          {queries.map((query) => (
            <option key={query.value} value={query.value}>
              {query.label}
            </option>
          ))}
        </select>

        <button
          onClick={fetchData}
          disabled={loading || !selectedQuery}
          className="w-full sm:w-auto bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
        >
          {loading ? (
            <span className="flex justify-center items-center">
              <div className="w-5 h-5 border-4 border-t-transparent border-blue-500 rounded-full animate-spin" />
              <span className="ml-2">Loading...</span>
            </span>
          ) : (
            "Fetch Data"
          )}
        </button>
      </div>

      {error && <p className="mt-4 text-red-500 text-center">{error}</p>}

      {fetchClicked && (
        <div className="mt-4 flex justify-center items-center space-x-4">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1 || loading}
            className="bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
          >
            Previous
          </button>

          <div className="flex space-x-2">
            {getPageNumbers().map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                className={`py-2 px-4 rounded-lg ${
                  pageNum === page
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-800 hover:bg-blue-100"
                }`}
              >
                {pageNum}
              </button>
            ))}
          </div>

          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={loading || page === totalPages} // Disable if current page is the last page
            className={`bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-400`}
          >
            Next
          </button>
        </div>
      )}

      {data ? (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full table-auto border-collapse">
            <thead>
              <tr className="bg-gray-200">
                {data.columnHeaders.map((header, index) => (
                  <th
                    key={index}
                    className="py-2 px-4 border-b text-left text-gray-600"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.formattedRows.map((row, index) => (
                <tr key={index} className="border-b">
                  {row.map((cell, idx) => (
                    <td key={idx} className="py-2 px-4 text-gray-800">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
};

export default QuerySelector;
