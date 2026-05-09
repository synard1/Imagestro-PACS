function OnStoredInstance(id, tags, metadata, origin)
  local acc = tags["AccessionNumber"]
  if acc == nil or acc == "" then
    PrintWarning("No AccessionNumber for instance: " .. id)
    return
  end
  -- cek ke accession-api
  -- (bisa diaktifkan kalau perlu)
  -- local r = HttpGet("http://accession-api:8080/internal/verify-accession?an="..acc)
end
