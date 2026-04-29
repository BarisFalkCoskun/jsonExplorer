import { memo } from "react";
import { Search } from "components/apps/FileExplorer/NavigationIcons";
import StyledSearch from "components/apps/FileExplorer/StyledSearch";

type SearchBarProps = {
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
};

const SearchBar: FCWithRef<HTMLInputElement, SearchBarProps> = ({
  ref: searchBarRef,
  searchTerm,
  setSearchTerm,
}) => {
  return (
    <StyledSearch>
      <input
        aria-label="Filter items in this folder"
        ref={searchBarRef}
        onChange={({ target }) => {
          setSearchTerm(target.value);
        }}
        placeholder="Filter this folder"
        spellCheck={false}
        type="search"
        value={searchTerm}
      />
      <Search />
    </StyledSearch>
  );
};

export default memo(SearchBar);
